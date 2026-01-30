import { z } from 'zod'

// Schema for getPlans validation (GET requests don't have a body, so optional)
const getPlansSchema = z.object({}).strict().optional()

// Schema for subscribe validation
const subscribeSchema = z.object({
  plan_id: z.string().min(1, 'Plan ID is required'),
  total_count: z.number().int().min(1, 'Total count must be at least 1').optional().default(12),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').optional().default(1),
  start_at: z.number().int().optional(),
  expire_by: z.number().int().optional(),
  customer_notify: z.boolean().optional().default(true),
  addons: z
    .array(
      z.object({
        item: z.object({
          name: z.string().min(1, 'Addon name is required'),
          amount: z.number().int().positive('Addon amount must be positive'),
          currency: z.string().min(1, 'Addon currency is required'),
        }),
      })
    )
    .optional(),
  offer_id: z.string().optional(),
  notes: z.record(z.string(), z.string()).optional(),
})

// Schema for verify payment validation
const verifyPaymentSchema = z.object({
  razorpay_payment_id: z.string().min(1, 'Payment ID is required'),
  razorpay_subscription_id: z.string().min(1, 'Subscription ID is required'),
  razorpay_signature: z.string().min(1, 'Signature is required'),
})

// Schema for pause subscription validation
const pauseSubscriptionSchema = z.object({
  subscription_id: z.string().min(1, 'Subscription ID is required'),
})

// Schema for cancel subscription validation
const cancelSubscriptionSchema = z.object({
  subscription_id: z.string().min(1, 'Subscription ID is required'),
})

// Schema for resume subscription validation
const resumeSubscriptionSchema = z.object({
  subscription_id: z.string().min(1, 'Subscription ID is required'),
})

export {
  getPlansSchema,
  subscribeSchema,
  verifyPaymentSchema,
  pauseSubscriptionSchema,
  cancelSubscriptionSchema,
  resumeSubscriptionSchema,
}
