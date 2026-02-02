import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import type Razorpay from 'razorpay'
import {
  handleRazorpayError,
  restoreSubscriptionSchema,
  type SubscriptionRecord,
} from '../lib'

/**
 * POST /api/auth/razorpay/subscription/restore
 * Restores a subscription by either:
 * - Undoing "cancel at period end" (calls Razorpay cancel_scheduled_changes), or
 * - Resuming a paused subscription (calls Razorpay resume).
 * Razorpay "resume" is only for paused subscriptions; use cancelScheduledChanges to undo scheduled cancellation.
 */
export const restoreSubscription = (razorpay: Razorpay) =>
  createAuthEndpoint(
    '/razorpay/subscription/restore',
    { method: 'POST', use: [sessionMiddleware] },
    async (ctx) => {
      try {
        const body = restoreSubscriptionSchema.parse(ctx.body)
        const userId = ctx.context.session?.user?.id
        if (!userId) {
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', description: 'User not authenticated' },
          }
        }

        const record = (await ctx.context.adapter.findOne({
          model: 'subscription',
          where: [{ field: 'id', value: body.subscriptionId }],
        })) as SubscriptionRecord | null

        if (!record) {
          return {
            success: false,
            error: { code: 'SUBSCRIPTION_NOT_FOUND', description: 'Subscription not found' },
          }
        }
        if (record.referenceId !== userId) {
          return {
            success: false,
            error: { code: 'FORBIDDEN', description: 'Subscription does not belong to you' },
          }
        }

        const rpId = record.razorpaySubscriptionId
        if (!rpId) {
          return {
            success: false,
            error: { code: 'INVALID_STATE', description: 'No Razorpay subscription linked' },
          }
        }

        // Razorpay: resume = paused → active only. Cancel-at-period-end = scheduled change; use cancelScheduledChanges.
        let subscription: { id: string; status: string }
        if (record.cancelAtPeriodEnd) {
          // Undo "cancel at period end" via Razorpay Cancel an Update API
          subscription = (await razorpay.subscriptions.cancelScheduledChanges(rpId)) as {
            id: string
            status: string
          }
        } else if (record.status === 'halted') {
          // Resume a paused subscription
          subscription = (await razorpay.subscriptions.resume(rpId)) as { id: string; status: string }
        } else {
          return {
            success: false,
            error: {
              code: 'INVALID_STATE',
              description:
                'Subscription cannot be restored: it is not scheduled to cancel at period end and is not paused. Only active subscriptions with cancelAtPeriodEnd or halted (paused) subscriptions can be restored.',
            },
          }
        }

        // Flat update so adapters (e.g. MongoDB) set top-level fields; { data: {...} } would set a nested "data" field
        await ctx.context.adapter.update({
          model: 'subscription',
          where: [{ field: 'id', value: body.subscriptionId }],
          update: {
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          },
        })

        return {
          success: true,
          data: {
            id: subscription.id,
            status: subscription.status,
          },
        }
      } catch (error) {
        return handleRazorpayError(error)
      }
    }
  )
