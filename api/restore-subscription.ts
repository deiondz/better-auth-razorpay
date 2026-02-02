import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import type Razorpay from 'razorpay'
import {
  handleRazorpayError,
  restoreSubscriptionSchema,
  type SubscriptionRecord,
} from '../lib'

/**
 * POST /api/auth/razorpay/subscription/restore
 * Restores a subscription that was scheduled to cancel at period end.
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

        // Razorpay: resume a paused subscription (or cancel scheduled cancellation)
        const subscription = await razorpay.subscriptions.resume(rpId)

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
            id: (subscription as { id: string }).id,
            status: (subscription as { status: string }).status,
          },
        }
      } catch (error) {
        return handleRazorpayError(error)
      }
    }
  )
