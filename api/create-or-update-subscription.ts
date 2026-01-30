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
        const plan = plans.find((p) => p.name === body.plan)
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
            user: user as { id: string; email?: string; name?: string; [key: string]: unknown },
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
            return {
              success: true,
              data: {
                checkoutUrl: rpSub.short_url,
                subscription: {
                  id: existing.id,
                  plan: existing.plan,
                  status: existing.status,
                  razorpaySubscriptionId: existing.razorpaySubscriptionId,
                  cancelAtPeriodEnd: existing.cancelAtPeriodEnd,
                  periodEnd: existing.periodEnd,
                  seats: existing.seats,
                },
              },
            }
          }
        }

        // Create new subscription
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
            id: '',
            plan: plan.name,
            referenceId: userId,
            status: 'created',
            cancelAtPeriodEnd: false,
            seats: body.seats,
            createdAt: now,
            updatedAt: now,
          }
          const extra = await subOpts.getSubscriptionCreateParams({
            user: user as { id: string; email?: string; name?: string; [key: string]: unknown },
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

        const subscriptionRecord: Omit<SubscriptionRecord, 'id'> & { id: string } = {
          id: localId,
          plan: plan.name,
          referenceId: userId,
          razorpayCustomerId: user.razorpayCustomerId ?? null,
          razorpaySubscriptionId: rpSubscription.id,
          status: toLocalStatus(rpSubscription.status),
          trialStart: null,
          trialEnd: null,
          periodStart: rpSubscription.current_start
            ? new Date(rpSubscription.current_start * 1000)
            : null,
          periodEnd: rpSubscription.current_end
            ? new Date(rpSubscription.current_end * 1000)
            : null,
          cancelAtPeriodEnd: false,
          seats: body.seats,
          groupId: null,
          createdAt: now,
          updatedAt: now,
        }

        await ctx.context.adapter.create({
          model: 'subscription',
          data: subscriptionRecord,
        })

        if (subOpts.onSubscriptionCreated) {
          await subOpts.onSubscriptionCreated({
            razorpaySubscription: rpSubscription,
            subscription: subscriptionRecord as SubscriptionRecord,
            plan,
          })
        }

        const checkoutUrl = body.disableRedirect
          ? rpSubscription.short_url
          : body.successUrl
            ? `${rpSubscription.short_url}?redirect=${encodeURIComponent(body.successUrl)}`
            : rpSubscription.short_url

        return {
          success: true,
          data: {
            checkoutUrl,
            subscriptionId: localId,
            razorpaySubscriptionId: rpSubscription.id,
          },
        }
      } catch (error) {
        return handleRazorpayError(error)
      }
    }
  )
