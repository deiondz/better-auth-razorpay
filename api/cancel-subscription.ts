import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import type Razorpay from 'razorpay'
import {
  cancelSubscriptionSchema,
  handleRazorpayError,
  type RazorpaySubscription,
  type RazorpaySubscriptionRecord,
} from '../lib'

/**
 * Cancels a subscription at the end of the current billing period.
 *
 * @param razorpay - The Razorpay instance initialized with API credentials
 * @returns A Better Auth endpoint handler
 *
 * @remarks
 * This endpoint:
 * - Requires user authentication via session
 * - Verifies subscription ownership before cancellation
 * - Cancels subscription at period end (not immediately)
 * - Updates user record with cancellation flag and period end date
 * - Subscription remains active until the current period ends
 *
 * @example
 * Request body:
 * ```json
 * {
 *   "subscription_id": "sub_1234567890"
 * }
 * ```
 */
export const cancelSubscription = (razorpay: Razorpay) =>
  createAuthEndpoint(
    '/razorpay/cancel-subscription',
    { method: 'POST', use: [sessionMiddleware] },
    async (_ctx) => {
      try {
        // Validate input using Zod schema
        const validatedInput = cancelSubscriptionSchema.parse(_ctx.body)

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

        // Get subscription record to verify it belongs to the user
        const subscriptionRecord = (await _ctx.context.adapter.findOne({
          model: 'razorpaySubscription',
          where: [{ field: 'subscriptionId', value: validatedInput.subscription_id }],
        })) as RazorpaySubscriptionRecord | null

        if (!subscriptionRecord) {
          return {
            success: false,
            error: {
              code: 'SUBSCRIPTION_NOT_FOUND',
              description: 'Subscription not found',
            },
          }
        }

        // Verify that the subscription belongs to the authenticated user
        const subscriptionUserId = subscriptionRecord.userId
        if (subscriptionUserId !== userId) {
          return {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              description: 'Subscription does not belong to authenticated user',
            },
          }
        }

        // Cancel subscription via Razorpay API (cancel at period end)
        const subscription = (await razorpay.subscriptions.cancel(
          validatedInput.subscription_id,
          true
        )) as RazorpaySubscription

        // Update user table with cancellation info (keep active status)
        await _ctx.context.adapter.update({
          model: 'user',
          where: [{ field: 'id', value: userId }],
          update: {
            data: {
              cancelAtPeriodEnd: true,
              subscriptionCurrentPeriodEnd: subscription.current_end
                ? new Date(subscription.current_end * 1000)
                : null,
            },
          },
        })

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
          },
        }
      } catch (error) {
        return handleRazorpayError(error)
      }
    }
  )
