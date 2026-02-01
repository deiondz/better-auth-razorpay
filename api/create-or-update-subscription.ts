import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import type Razorpay from 'razorpay'
import {
  createOrUpdateSubscriptionSchema,
  handleRazorpayError,
  type RazorpayPlan,
  type RazorpayPluginOptions,
  type RazorpaySubscription,
  type RazorpayUserRecord,
  type SubscriptionRecord,
} from '../lib'

async function resolvePlans(
  plans: RazorpayPlan[] | (() => Promise<RazorpayPlan[]>)
): Promise<RazorpayPlan[]> {
  return typeof plans === 'function' ? plans() : plans
}

function toLocalStatus(razorpayStatus: string): SubscriptionRecord['status'] {
  const map: Record<string, SubscriptionRecord['status']> = {
    created: 'created',
    authenticated: 'pending',
    active: 'active',
    pending: 'pending',
    halted: 'halted',
    cancelled: 'cancelled',
    completed: 'completed',
    expired: 'expired',
  }
  return map[razorpayStatus] ?? 'pending'
}

/**
 * POST /api/auth/razorpay/subscription/create-or-update
 * Creates a new subscription or updates an existing one (plan/quantity).
 * Returns checkoutUrl for Razorpay payment page, or updated subscription for updates.
 */
export const createOrUpdateSubscription = (
  razorpay: Razorpay,
  options: Pick<
    RazorpayPluginOptions,
    'subscription' | 'createCustomerOnSignUp'
  >
) =>
  createAuthEndpoint(
    '/razorpay/subscription/create-or-update',
    { method: 'POST', use: [sessionMiddleware] },
    async (ctx) => {
      try {
        const body = createOrUpdateSubscriptionSchema.parse(ctx.body)
        const subOpts = options.subscription
        if (!subOpts?.enabled) {
          return {
            success: false,
            error: { code: 'SUBSCRIPTION_DISABLED', description: 'Subscription feature is disabled' },
          }
        }

        const plans = await resolvePlans(subOpts.plans)
        // Look up by plan name or by Razorpay plan ID (plan_*)
        const plan =
          body.plan.startsWith('plan_')
            ? plans.find(
              (p) => p.monthlyPlanId === body.plan || p.annualPlanId === body.plan
            )
            : plans.find((p) => p.name === body.plan)
        if (!plan) {
          return {
            success: false,
            error: { code: 'PLAN_NOT_FOUND', description: `Plan "${body.plan}" not found` },
          }
        }

        const planId = body.annual && plan.annualPlanId ? plan.annualPlanId : plan.monthlyPlanId
        const userId = ctx.context.session?.user?.id
        if (!userId) {
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', description: 'User not authenticated' },
          }
        }

        const user = (await ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: userId }],
        })) as RazorpayUserRecord | null
        if (!user) {
          return {
            success: false,
            error: { code: 'USER_NOT_FOUND', description: 'User not found' },
          }
        }

        if (subOpts.requireEmailVerification && user.email) {
          // If your Better Auth setup has emailVerified, check it here
          // const verified = (user as { emailVerified?: boolean }).emailVerified
          // if (!verified) return { success: false, error: { code: 'EMAIL_NOT_VERIFIED', ... } }
        }

        if (subOpts.authorizeReference) {
          const allowed = await subOpts.authorizeReference({
            user: user as { id: string; email?: string; name?: string;[key: string]: unknown },
            referenceId: userId,
            action: 'create-or-update',
          })
          if (!allowed) {
            return {
              success: false,
              error: { code: 'FORBIDDEN', description: 'Not authorized to manage this subscription' },
            }
          }
        }

        const now = new Date()
        const generateId = ctx.context.generateId as
          | ((options: { model: string; size?: number }) => string | false)
          | undefined
        const generated =
          typeof generateId === 'function'
            ? generateId({ model: 'subscription' })
            : undefined
        const localId =
          (typeof generated === 'string' ? generated : undefined) ??
          `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

        // Update existing subscription (by local id)
        if (body.subscriptionId) {
          const existing = (await ctx.context.adapter.findOne({
            model: 'subscription',
            where: [{ field: 'id', value: body.subscriptionId }],
          })) as SubscriptionRecord | null
          if (!existing) {
            return {
              success: false,
              error: { code: 'SUBSCRIPTION_NOT_FOUND', description: 'Subscription not found' },
            }
          }
          if (existing.referenceId !== userId) {
            return {
              success: false,
              error: { code: 'FORBIDDEN', description: 'Subscription does not belong to you' },
            }
          }
          // For "update" we could call Razorpay subscription update API if needed.
          // Here we treat update as "create new" is not required by GitHub README; they return "updated subscription".
          const rpSub = existing.razorpaySubscriptionId
            ? ((await razorpay.subscriptions.fetch(existing.razorpaySubscriptionId)) as RazorpaySubscription)
            : null
          if (rpSub) {
            const data: {
              checkoutUrl?: string | null
              subscription: {
                id: string
                plan: string
                planId: string | null
                status: SubscriptionRecord['status']
                razorpaySubscriptionId: string | null
                cancelAtPeriodEnd: boolean
                periodEnd: Date | null
                seats: number
              }
            } = {
              subscription: {
                id: existing.id,
                plan: existing.plan,
                planId: existing.planId ?? null,
                status: existing.status,
                razorpaySubscriptionId: existing.razorpaySubscriptionId ?? null,
                cancelAtPeriodEnd: existing.cancelAtPeriodEnd ?? false,
                periodEnd: existing.periodEnd ?? null,
                seats: existing.seats ?? 1,
              },
            }
            if (!body.embed) data.checkoutUrl = rpSub.short_url
            return { success: true, data }
          }
        }

        // One subscription per user at a time: block if they already have an active paid one (with Razorpay subscription)
        const existingSubs = (await ctx.context.adapter.findMany({
          model: 'subscription',
          where: [{ field: 'referenceId', value: userId }],
        })) as SubscriptionRecord[] | null
        const activeStatuses: SubscriptionRecord['status'][] = [
          'active',
          'trialing',
          'pending',
          'created',
          'halted',
        ]
        const subs = existingSubs ?? []
        const activePaidSubs = subs.filter(
          (s) => activeStatuses.includes(s.status) && s.razorpaySubscriptionId
        )
        const appTrialSubs = subs.filter(
          (s) => s.status === 'trialing' && !s.razorpaySubscriptionId
        )
        const appTrialSub = appTrialSubs.length === 1 ? appTrialSubs[0]! : null

        if (activePaidSubs.length > 0) {
          return {
            success: false,
            error: {
              code: 'ALREADY_SUBSCRIBED',
              description: 'You already have an active subscription. Cancel or let it expire before creating another.',
            },
          }
        }

        const totalCount = body.annual ? 1 : 12
        const subscriptionPayload: Parameters<Razorpay['subscriptions']['create']>[0] = {
          plan_id: planId,
          total_count: totalCount,
          quantity: body.seats,
          customer_notify: true,
          notes: { referenceId: userId, planName: plan.name },
        }

        if (subOpts.getSubscriptionCreateParams) {
          const tempSub: SubscriptionRecord = {
            id: appTrialSub?.id ?? '',
            plan: plan.name,
            planId,
            referenceId: userId,
            status: 'created',
            cancelAtPeriodEnd: false,
            seats: body.seats,
            createdAt: now,
            updatedAt: now,
          }
          const extra = await subOpts.getSubscriptionCreateParams({
            user: user as { id: string; email?: string; name?: string;[key: string]: unknown },
            session: ctx.context.session,
            plan,
            subscription: tempSub,
          })
          if (extra?.params?.notes && typeof extra.params.notes === 'object') {
            subscriptionPayload.notes = { ...subscriptionPayload.notes, ...extra.params.notes }
          }
          if (extra?.params && typeof extra.params === 'object') {
            Object.assign(subscriptionPayload, extra.params)
          }
        }

        const rpSubscription = (await razorpay.subscriptions.create(
          subscriptionPayload
        )) as RazorpaySubscription

        const periodStart = rpSubscription.current_start
          ? new Date(rpSubscription.current_start * 1000)
          : null
        const periodEnd = rpSubscription.current_end
          ? new Date(rpSubscription.current_end * 1000)
          : null
        const newStatus = toLocalStatus(rpSubscription.status)

        if (appTrialSub) {
          // Upgrade from app trial: update the existing record instead of creating a new one
          await ctx.context.adapter.update({
            model: 'subscription',
            where: [{ field: 'id', value: appTrialSub.id }],
            update: {
              data: {
                plan: plan.name,
                planId,
                razorpaySubscriptionId: rpSubscription.id,
                status: newStatus,
                trialEnd: now,
                periodStart,
                periodEnd,
                seats: body.seats,
                updatedAt: now,
              },
            },
          })

          if (subOpts.onSubscriptionCreated) {
            const updatedRecord: SubscriptionRecord = {
              ...appTrialSub,
              plan: plan.name,
              planId,
              razorpaySubscriptionId: rpSubscription.id,
              status: newStatus,
              trialEnd: now,
              periodStart,
              periodEnd,
              seats: body.seats,
              updatedAt: now,
            }
            await subOpts.onSubscriptionCreated({
              razorpaySubscription: rpSubscription,
              subscription: updatedRecord,
              plan,
            })
          }

          const data: {
            checkoutUrl?: string | null
            subscriptionId: string
            razorpaySubscriptionId: string
          } = {
            subscriptionId: appTrialSub.id,
            razorpaySubscriptionId: rpSubscription.id,
          }
          if (!body.embed) {
            data.checkoutUrl =
              body.disableRedirect
                ? rpSubscription.short_url
                : body.successUrl
                  ? `${rpSubscription.short_url}?redirect=${encodeURIComponent(body.successUrl)}`
                  : rpSubscription.short_url
          }
          return { success: true, data }
        }

        // Create new subscription record
        const subscriptionRecord: Omit<SubscriptionRecord, 'id'> & { id: string } = {
          id: localId,
          plan: plan.name,
          planId,
          referenceId: userId,
          razorpayCustomerId: user.razorpayCustomerId ?? null,
          razorpaySubscriptionId: rpSubscription.id,
          status: newStatus,
          trialStart: null,
          trialEnd: null,
          periodStart,
          periodEnd,
          cancelAtPeriodEnd: false,
          seats: body.seats,
          groupId: null,
          createdAt: now,
          updatedAt: now,
        }

        await ctx.context.adapter.create({
          model: 'subscription',
          data: subscriptionRecord,
          forceAllowId: true,
        } as Parameters<typeof ctx.context.adapter.create>[0])

        if (subOpts.onSubscriptionCreated) {
          await subOpts.onSubscriptionCreated({
            razorpaySubscription: rpSubscription,
            subscription: subscriptionRecord as SubscriptionRecord,
            plan,
          })
        }

        const data: {
          checkoutUrl?: string | null
          subscriptionId: string
          razorpaySubscriptionId: string
        } = {
          subscriptionId: localId,
          razorpaySubscriptionId: rpSubscription.id,
        }
        if (!body.embed) {
          data.checkoutUrl =
            body.disableRedirect
              ? rpSubscription.short_url
              : body.successUrl
                ? `${rpSubscription.short_url}?redirect=${encodeURIComponent(body.successUrl)}`
                : rpSubscription.short_url
        }

        return { success: true, data }
      } catch (error) {
        return handleRazorpayError(error)
      }
    }
  )
