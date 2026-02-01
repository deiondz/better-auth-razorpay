import { z } from 'zod'

export const createOrUpdateSubscriptionSchema = z.object({
  plan: z.string().min(1, 'Plan name or Razorpay plan ID (plan_*) is required'),
  annual: z.boolean().optional().default(false),
  seats: z.number().int().min(1).optional().default(1),
  subscriptionId: z.string().optional(),
  successUrl: z.string().url().optional(),
  disableRedirect: z.boolean().optional().default(false),
  /** When true, checkout runs in-page via Razorpay modal; no checkoutUrl redirect. */
  embed: z.boolean().optional().default(false),
})

export const cancelSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1, 'Subscription ID (local) is required'),
  immediately: z.boolean().optional().default(false),
})

export const restoreSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1, 'Subscription ID (local) is required'),
})

export const listSubscriptionsSchema = z.object({
  referenceId: z.string().optional(),
})

export const verifyPaymentSchema = z.object({
  razorpay_payment_id: z.string().min(1, 'Payment ID is required'),
  razorpay_subscription_id: z.string().min(1, 'Subscription ID is required'),
  razorpay_signature: z.string().min(1, 'Signature is required'),
})

export {
  createOrUpdateSubscriptionSchema as subscribeSchema,
}
export type CreateOrUpdateSubscriptionInput = z.infer<typeof createOrUpdateSubscriptionSchema>
