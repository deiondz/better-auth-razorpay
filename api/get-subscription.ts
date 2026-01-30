import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import type Razorpay from 'razorpay'
import {
  handleRazorpayError,
  type RazorpaySubscription,
  type RazorpayUserRecord,
} from '../lib'

/**
 * Retrieves the current subscription details for the authenticated user.
 *
 * @param razorpay - The Razorpay instance initialized with API credentials
 * @returns A Better Auth endpoint handler
 *
 * @remarks
 * This endpoint:
 * - Requires user authentication via session
 * - Fetches subscription details from Razorpay API
 * - Includes cancellation status and period end information
 * - Returns null if user has no active subscription
 * - Provides detailed error messages in development mode
 *
 * @example
 * Response (success):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "id": "sub_1234567890",
 *     "status": "active",
 *     "plan_id": "plan_1234567890",
 *     "cancel_at_period_end": false,
 *     ...
 *   }
 * }
 * ```
 */
export const getSubscription = (razorpay: Razorpay) =>
  createAuthEndpoint(
    '/razorpay/get-subscription',
    { method: 'GET', use: [sessionMiddleware] },
    async (_ctx) => {
      try {
        // Get user ID from session
        const userId = _ctx.context.session?.user?.id

        if (!userId) {
          return {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              description: 'User not authenticated',
            },
          }
        }

        // Get user record to check subscription status
        const user = (await _ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: userId }],
        })) as RazorpayUserRecord | null

        if (!user) {
          return {
            success: false,
            error: {
              code: 'USER_NOT_FOUND',
              description: 'User not found',
            },
          }
        }

        // Check subscription status from user table
        const subscriptionId = user.subscriptionId

        if (!subscriptionId) {
          return {
            success: true,
            data: null,
          }
        }

        // Fetch full subscription details from Razorpay API
        try {
          const subscription = (await razorpay.subscriptions.fetch(
            subscriptionId
          )) as RazorpaySubscription

          // Read cancellation status from user table
          const cancelAtPeriodEnd = user.cancelAtPeriodEnd ?? false
          const subscriptionCurrentPeriodEnd = user.subscriptionCurrentPeriodEnd

          return {
            success: true,
            data: {
              id: subscription.id,
              entity: subscription.entity,
              plan_id: subscription.plan_id,
              status: subscription.status,
              current_start: subscription.current_start,
              current_end: subscription.current_end,
              ended_at: subscription.ended_at,
              quantity: subscription.quantity,
              notes: subscription.notes,
              charge_at: subscription.charge_at,
              start_at: subscription.start_at,
              end_at: subscription.end_at,
              auth_attempts: subscription.auth_attempts,
              total_count: subscription.total_count,
              paid_count: subscription.paid_count,
              customer_notify: subscription.customer_notify,
              created_at: subscription.created_at,
              expire_by: subscription.expire_by,
              short_url: subscription.short_url,
              has_scheduled_changes: subscription.has_scheduled_changes,
              change_scheduled_at: subscription.change_scheduled_at,
              source: subscription.source,
              offer_id: subscription.offer_id,
              remaining_count: subscription.remaining_count,
              cancel_at_period_end: cancelAtPeriodEnd,
              subscription_current_period_end: subscriptionCurrentPeriodEnd
                ? Math.floor(new Date(subscriptionCurrentPeriodEnd).getTime() / 1000)
                : null,
            },
          }
        } catch (razorpayError) {
          // Handle Razorpay-specific errors with subscription ID context
          const isDev = process.env.NODE_ENV === 'development'

          // Extract error message from Razorpay error
          let errorMessage = 'Failed to fetch subscription'
          let errorCode = 'SUBSCRIPTION_FETCH_FAILED'

          if (razorpayError && typeof razorpayError === 'object') {
            // Razorpay error format: { error: { code: string, description: string } }
            if ('error' in razorpayError) {
              const razorpayErr = razorpayError as {
                error?: { code?: string; description?: string }
              }
              errorCode = razorpayErr.error?.code || errorCode
              errorMessage = razorpayErr.error?.description || errorMessage
            } else if ('message' in razorpayError) {
              errorMessage = (razorpayError as { message: string }).message
            }
          }

          // Check if error is specifically about subscription not existing
          const isNotFoundError =
            errorMessage.toLowerCase().includes('does not exist') ||
            errorMessage.toLowerCase().includes('not found') ||
            errorCode === 'BAD_REQUEST_ERROR'

          // Include subscription ID in error for debugging
          const description = isDev
            ? `${errorMessage} (Subscription ID: ${subscriptionId})`
            : isNotFoundError
              ? 'The subscription could not be found. This may indicate the subscription was deleted or the ID is invalid. Please contact support if this issue persists.'
              : 'Unable to retrieve subscription information. Please try again or contact support if this issue persists.'

          return {
            success: false,
            error: {
              code: errorCode,
              description,
              // Include subscription ID in metadata for development
              ...(isDev && { subscriptionId }),
            },
          }
        }
      } catch (error) {
        return handleRazorpayError(error)
      }
    }
  )
