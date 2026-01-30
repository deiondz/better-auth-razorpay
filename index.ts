import type { BetterAuthPlugin } from 'better-auth'
import Razorpay from 'razorpay'
import {
  cancelSubscription,
  getPlans,
  getSubscription,
  pauseSubscription,
  resumeSubscription,
  subscribe,
  verifyPayment,
  webhook,
} from './api'
import type { RazorpayPluginOptions } from './lib'

/**
 * Razorpay plugin for Better Auth.
 *
 * Provides subscription management functionality including:
 * - Creating subscriptions
 * - Managing subscription lifecycle (pause, resume, cancel)
 * - Payment verification
 * - Webhook handling for subscription events
 * - Plan retrieval
 *
 * @param options - Plugin configuration options
 * @param options.keyId - Razorpay key ID (required)
 * @param options.keySecret - Razorpay key secret (required)
 * @param options.webhookSecret - Webhook secret for signature verification (optional)
 * @param options.plans - Array of plan IDs from Razorpay dashboard (required)
 * @param options.onWebhookEvent - Optional callback for custom webhook event handling
 * @returns Better Auth plugin configuration
 *
 * @throws {Error} If keyId or keySecret are not provided
 *
 * @example
 * ```typescript
 * import { razorpayPlugin } from '@better-auth/razorpay'
 *
 * const auth = betterAuth({
 *   plugins: [
 *     razorpayPlugin({
 *       keyId: process.env.RAZORPAY_KEY_ID!,
 *       keySecret: process.env.RAZORPAY_KEY_SECRET!,
 *       webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
 *       plans: ['plan_1234567890', 'plan_0987654321'],
 *     }),
 *   ],
 * })
 * ```
 */
export const razorpayPlugin = (options: RazorpayPluginOptions) => {
  const { keyId, keySecret, webhookSecret, plans, onWebhookEvent } = options

  if (!keyId || !keySecret) {
    throw new Error('Razorpay keyId and keySecret are required')
  }

  // Initialize Razorpay instance once in plugin closure
  // This instance is accessible to all endpoints via closure scope
  const razorpay = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  })

  return {
    id: 'razorpay-plugin',

    schema: {
      user: {
        fields: {
          subscriptionId: { type: 'string', required: false },
          subscriptionPlanId: { type: 'string', required: false },
          subscriptionStatus: { type: 'string', required: false },
          subscriptionCurrentPeriodEnd: { type: 'date', required: false },
          cancelAtPeriodEnd: { type: 'boolean', required: false },
          lastPaymentDate: { type: 'date', required: false },
          nextBillingDate: { type: 'date', required: false },
        },
      },
      razorpayCustomer: {
        fields: {
          userId: { type: 'string', unique: true },
          razorpayCustomerId: { type: 'string', unique: true },
        },
      },
      razorpaySubscription: {
        fields: {
          userId: { type: 'string' },
          subscriptionId: { type: 'string' },
          planId: { type: 'string' },
          status: { type: 'string' },
        },
      },
    },

    endpoints: {
      subscribe: subscribe(razorpay, plans),
      'get-plans': getPlans(razorpay, plans),
      'verify-payment': verifyPayment(keySecret),
      webhook: webhook(webhookSecret, onWebhookEvent),
      'get-subscription': getSubscription(razorpay),
      'pause-subscription': pauseSubscription(razorpay),
      'cancel-subscription': cancelSubscription(razorpay),
      'resume-subscription': resumeSubscription(razorpay),
    },
  } satisfies BetterAuthPlugin
}

// Re-export types for external usage
export type {
  OnWebhookEventCallback,
  RazorpayApiResponse,
  RazorpayErrorResponse,
  RazorpayPluginOptions,
  RazorpaySubscription,
  RazorpaySubscriptionRecord,
  RazorpaySuccessResponse,
  RazorpayUserRecord,
  RazorpayWebhookContext,
  RazorpayWebhookEvent,
  RazorpayWebhookPayload,
} from './lib'
export type { WebhookResult } from './api/webhook'
