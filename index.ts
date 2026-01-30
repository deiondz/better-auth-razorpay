import type { BetterAuthPlugin } from 'better-auth'
import {
  cancelSubscription,
  createOrUpdateSubscription,
  getPlans,
  listSubscriptions,
  restoreSubscription,
  webhook,
} from './api'
import type { RazorpayPluginOptions, RazorpayUserRecord } from './lib'

/**
 * Razorpay plugin for Better Auth.
 *
 * Aligns with the subscription flow from the community plugin:
 * - Subscription: create-or-update (checkout URL), cancel, restore, list
 * - Customer: optional creation on sign-up, callbacks and params
 * - Webhooks: subscription events (activated, cancelled, expired, etc.) with optional callbacks
 * - Plans: named plans with monthly/annual IDs, limits, free trial
 *
 * @param options - Plugin configuration
 * @param options.razorpayClient - Initialized Razorpay instance (key_id, key_secret)
 * @param options.razorpayWebhookSecret - Webhook secret for signature verification
 * @param options.createCustomerOnSignUp - Create Razorpay customer when user signs up (default: false)
 * @param options.onCustomerCreate - Callback after customer is created
 * @param options.getCustomerCreateParams - Custom params when creating customer
 * @param options.subscription - Subscription config (enabled, plans, callbacks, authorizeReference)
 * @param options.onEvent - Global callback for all webhook events
 */
export const razorpayPlugin = (options: RazorpayPluginOptions) => {
  const {
    razorpayClient,
    razorpayWebhookSecret,
    createCustomerOnSignUp = false,
    onCustomerCreate,
    getCustomerCreateParams,
    subscription: subOpts,
    onEvent,
  } = options

  if (!razorpayClient) {
    throw new Error('Razorpay plugin: razorpayClient is required')
  }

  const razorpay = razorpayClient as import('razorpay')

  const plugin = {
    id: 'razorpay-plugin',

    schema: {
      user: {
        fields: {
          razorpayCustomerId: { type: 'string', required: false },
        },
      },
      subscription: {
        fields: {
          id: { type: 'string', required: true },
          plan: { type: 'string', required: true },
          referenceId: { type: 'string', required: true },
          razorpayCustomerId: { type: 'string', required: false },
          razorpaySubscriptionId: { type: 'string', required: false },
          status: { type: 'string', required: true },
          trialStart: { type: 'date', required: false },
          trialEnd: { type: 'date', required: false },
          periodStart: { type: 'date', required: false },
          periodEnd: { type: 'date', required: false },
          cancelAtPeriodEnd: { type: 'boolean', required: false },
          seats: { type: 'number', required: false },
          groupId: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
          updatedAt: { type: 'date', required: true },
        },
      },
    },

    endpoints: {
      'subscription/create-or-update': createOrUpdateSubscription(razorpay, {
        subscription: subOpts,
        createCustomerOnSignUp,
      }),
      'subscription/cancel': cancelSubscription(razorpay),
      'subscription/restore': restoreSubscription(razorpay),
      'subscription/list': listSubscriptions({ subscription: subOpts }),
      'get-plans': getPlans({ subscription: subOpts }),
      webhook: webhook(razorpayWebhookSecret, options.onWebhookEvent ?? undefined, {
        subscription: subOpts,
        onEvent,
      }),
    },

    databaseHooks: createCustomerOnSignUp
      ? {
          user: {
            create: {
              after: async (
                user: RazorpayUserRecord & { id: string },
                ctx: { context?: { adapter?: { update: (p: unknown) => Promise<unknown> } }; adapter?: { update: (p: unknown) => Promise<unknown> }; session?: unknown }
              ) => {
                const adapter = ctx.context?.adapter ?? (ctx as { adapter?: { update: (p: unknown) => Promise<unknown> } }).adapter
                if (!adapter?.update) return
                try {
                  const params: { name?: string; email?: string; contact?: string; [key: string]: unknown } = {
                    name: user.name ?? user.email ?? 'Customer',
                    email: user.email ?? undefined,
                  }
                  if (getCustomerCreateParams) {
                    const extra = await getCustomerCreateParams({
                      user: user as RazorpayUserRecord,
                      session: ctx.session,
                    })
                    if (extra?.params && typeof extra.params === 'object') {
                      Object.assign(params, extra.params)
                    }
                  }
                  const customer = await razorpay.customers.create(params)
                  await adapter.update({
                    model: 'user',
                    where: [{ field: 'id', value: user.id }],
                    update: { data: { razorpayCustomerId: customer.id } },
                  })
                  if (onCustomerCreate) {
                    await onCustomerCreate({
                      user: user as RazorpayUserRecord,
                      razorpayCustomer: { id: customer.id, ...(customer as unknown as Record<string, unknown>) },
                    })
                  }
                } catch (err) {
                  console.error('[better-auth-razorpay] Create customer on sign-up failed:', err)
                }
              },
            },
          },
        }
      : undefined,
  }

  return plugin as BetterAuthPlugin
}

export type {
  OnWebhookEventCallback,
  RazorpayApiResponse,
  RazorpayErrorResponse,
  RazorpayPlan,
  RazorpayPluginOptions,
  RazorpaySubscription,
  RazorpaySuccessResponse,
  RazorpayUserRecord,
  RazorpayWebhookContext,
  RazorpayWebhookEvent,
  RazorpayWebhookPayload,
  SubscriptionRecord,
  SubscriptionStatus,
} from './lib'
export type { WebhookResult } from './api/webhook'
