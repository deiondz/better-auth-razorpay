import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import type Razorpay from 'razorpay'
import {
  cancelSubscriptionSchema,
  handleRazorpayError,
  type RazorpaySubscription,
  type SubscriptionRecord,
} from '../lib'

/**
 * POST /api/auth/razorpay/subscription/cancel
 * Cancels subscription by local subscription ID. Optionally cancel immediately.
 */
export const cancelSubscription = (razorpay: Razorpay) =>
  createAuthEndpoint(
    '/razorpay/subscription/cancel',
    { method: 'POST', use: [sessionMiddleware] },
    async (ctx) => {
      try {
        const body = cancelSubscriptionSchema.parse(ctx.body)
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

        // cancel_at_cycle_end: true = cancel at period end, false = cancel immediately
        const subscription = (await razorpay.subscriptions.cancel(
          rpId,
          !body.immediately
        )) as RazorpaySubscription

        await ctx.context.adapter.update({
          model: 'subscription',
          where: [{ field: 'razorpaySubscriptionId', value: body.subscriptionId }],
          update: {
            data: {
              cancelAtPeriodEnd: !body.immediately,
              updatedAt: new Date(),
            },
          },
        })

        return {
          success: true,
          data: {
            id: subscription.id,
            status: subscription.status,
            plan_id: subscription.plan_id,
            current_end: subscription.current_end,
            ended_at: subscription.ended_at,
          },
        }
      } catch (error) {
        return handleRazorpayError(error)
      }
    }
  )
