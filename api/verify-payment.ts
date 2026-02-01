import { createHmac } from 'node:crypto'
import type Razorpay from 'razorpay'
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import {
  handleRazorpayError,
  verifyPaymentSchema,
  type SubscriptionRecord,
} from '../lib'

/**
 * POST /api/auth/razorpay/verify-payment
 * Verifies payment signature after Razorpay subscription checkout completion.
 * Returns amount (in paisa) and currency from Razorpay so the success screen can display them (e.g. URL-return flow).
 * Requires razorpayKeySecret and Razorpay client in plugin options.
 */
export const verifyPayment = (razorpay: Razorpay, keySecret: string) =>
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

        let amount = 0
        let currency: string | undefined
        try {
          const payment = await razorpay.payments.fetch(razorpay_payment_id) as { amount?: number; currency?: string }
          if (payment && typeof payment.amount === 'number') amount = payment.amount
          if (payment && typeof payment.currency === 'string') currency = payment.currency
        } catch {
          // Non-fatal: success screen can still show 0 / unknown currency
        }

        return {
          success: true,
          data: {
            message: 'Payment verified successfully',
            payment_id: razorpay_payment_id,
            subscription_id: razorpay_subscription_id,
            amount,
            ...(currency != null && { currency }),
          },
        }
      } catch (error) {
        return handleRazorpayError(error)
      }
    }
  )
