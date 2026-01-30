import { createHmac } from 'node:crypto'
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import { handleRazorpayError, type RazorpaySubscriptionRecord, verifyPaymentSchema } from '../lib'

/**
 * Verifies a payment signature after Razorpay checkout completion.
 *
 * @param keySecret - The Razorpay key secret used for signature verification
 * @returns A Better Auth endpoint handler
 *
 * @remarks
 * This endpoint:
 * - Requires user authentication via session
 * - Verifies payment signature using HMAC SHA256
 * - Validates subscription ownership
 * - Updates subscription status to 'authenticated'
 * - Updates user record with payment date
 * - Should be called after successful Razorpay checkout
 *
 * @example
 * Request body:
 * ```json
 * {
 *   "razorpay_payment_id": "pay_1234567890",
 *   "razorpay_subscription_id": "sub_1234567890",
 *   "razorpay_signature": "abc123..."
 * }
 * ```
 */
export const verifyPayment = (keySecret: string) =>
  createAuthEndpoint(
    '/razorpay/verify-payment',
    { method: 'POST', use: [sessionMiddleware] },
    async (_ctx) => {
      try {
        // Validate input using Zod schema
        const validatedInput = verifyPaymentSchema.parse(_ctx.body)

        const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = validatedInput

        // Generate expected signature
        const generated_signature = createHmac('sha256', keySecret)
          .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
          .digest('hex')

        // Verify signature
        if (generated_signature !== razorpay_signature) {
          return {
            success: false,
            error: {
              code: 'SIGNATURE_VERIFICATION_FAILED',
              description: 'Payment signature verification failed',
            },
          }
        }

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
          where: [{ field: 'subscriptionId', value: razorpay_subscription_id }],
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
        if (subscriptionRecord.userId !== userId) {
          return {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              description: 'Subscription does not belong to authenticated user',
            },
          }
        }

        // Update subscription status to authenticated/active
        await _ctx.context.adapter.update({
          model: 'razorpaySubscription',
          where: [{ field: 'subscriptionId', value: razorpay_subscription_id }],
          update: { status: 'authenticated' },
        })

        // Update user table with subscription status and payment date
        await _ctx.context.adapter.update({
          model: 'user',
          where: [{ field: 'id', value: userId }],
          update: {
            data: {
              subscriptionStatus: 'authenticated',
              subscriptionId: razorpay_subscription_id,
              lastPaymentDate: new Date(),
            },
          },
        })

        return {
          success: true,
          data: {
            message: 'Payment verified successfully',
            payment_id: razorpay_payment_id,
            subscription_id: razorpay_subscription_id,
          },
        }
      } catch (error) {
        return handleRazorpayError(error)
      }
    }
  )
