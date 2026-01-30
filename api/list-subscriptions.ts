import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import {
  handleRazorpayError,
  listSubscriptionsSchema,
  type RazorpayPluginOptions,
  type SubscriptionRecord,
} from '../lib'

const ACTIVE_STATUSES: SubscriptionRecord['status'][] = [
  'active',
  'trialing',
  'pending',
  'created',
]

/**
 * GET /api/auth/razorpay/subscription/list
 * Lists active and trialing subscriptions for the current user (or referenceId if authorized).
 */
export const listSubscriptions = (
  options: Pick<RazorpayPluginOptions, 'subscription'>
) =>
  createAuthEndpoint(
    '/razorpay/subscription/list',
    { method: 'GET', use: [sessionMiddleware] },
    async (ctx) => {
      try {
        const query = listSubscriptionsSchema.parse(ctx.query ?? {})
        const userId = ctx.context.session?.user?.id
        if (!userId) {
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', description: 'User not authenticated' },
          }
        }

        const referenceId = query.referenceId ?? userId
        if (referenceId !== userId && options.subscription?.authorizeReference) {
          const user = (await ctx.context.adapter.findOne({
            model: 'user',
            where: [{ field: 'id', value: userId }],
          })) as { id: string; email?: string; name?: string } | null
          if (!user) {
            return {
              success: false,
              error: { code: 'USER_NOT_FOUND', description: 'User not found' },
            }
          }
          const allowed = await options.subscription.authorizeReference({
            user: user as { id: string; email?: string; name?: string; [key: string]: unknown },
            referenceId,
            action: 'list',
          })
          if (!allowed) {
            return {
              success: false,
              error: { code: 'FORBIDDEN', description: 'Not authorized to list this user\'s subscriptions' },
            }
          }
        }

        const list = (await ctx.context.adapter.findMany({
          model: 'subscription',
          where: [{ field: 'referenceId', value: referenceId }],
        })) as SubscriptionRecord[] | null

        const subscriptions = (list ?? []).filter((s) =>
          ACTIVE_STATUSES.includes(s.status)
        )

        return {
          success: true,
          data: subscriptions,
        }
      } catch (error) {
        return handleRazorpayError(error)
      }
    }
  )
