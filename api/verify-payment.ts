import { createHmac } from 'node:crypto'
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import {
  handleRazorpayError,
  verifyPaymentSchema,
  type SubscriptionRecord,
} from '../lib'

/**
 * POST /api/auth/razorpay/verify-payment
 * Verifies payment signature after Razorpay subscription checkout completion.
 * Requires razorpayKeySecret to be set in plugin options.
 */
export const verifyPayment = (keySecret: string) =>
  createAuthEndpoint(
    '/razorpay/verify-payment',
    { method: 'POST', use: [sessionMiddleware] },
    async (ctx) => {
      try {
        const body = verifyPaymentSchema.parse(ctx.body)
        const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = body

        const generatedSignature = createHmac('sha256', keySecret)
          .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
          .digest('hex')

        if (generatedSignature !== razorpay_signature) {
          return {
            success: false,
            error: {
              code: 'SIGNATURE_VERIFICATION_FAILED',
              description: 'Payment signature verification failed',
            },
          }
        }

        const userId = ctx.context.session?.user?.id
        if (!userId) {
          return {
            success: false,
            error: { code: 'UNAUTHORIZED', description: 'User not authenticated' },
          }
        }

        const record = (await ctx.context.adapter.findOne({
          model: 'subscription',
          where: [{ field: 'razorpaySubscriptionId', value: razorpay_subscription_id }],
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

        await ctx.context.adapter.update({
          model: 'subscription',
          where: [{ field: 'razorpaySubscriptionId', value: razorpay_subscription_id }],
          update: {
            data: {
              status: 'pending',
              updatedAt: new Date(),
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
