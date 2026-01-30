import { createHmac } from 'node:crypto'
import { createAuthEndpoint } from 'better-auth/api'
import type { OnWebhookEventCallback } from '../lib/types'

export interface WebhookResult {
  success: boolean
  message?: string
}

interface SubscriptionEntity {
  id: string
  plan_id: string
  status: string
  current_start?: number
  current_end?: number
}

interface WebhookContext {
  adapter: {
    findOne: (params: {
      model: string
      where: { field: string; value: string }[]
    }) => Promise<unknown>
    update: (params: {
      model: string
      where: { field: string; value: string }[]
      update: Record<string, unknown>
    }) => Promise<unknown>
  }
}

type EventHandler = (
  adapter: WebhookContext['adapter'],
  subscriptionId: string,
  userId: string,
  subscription: SubscriptionEntity
) => Promise<void>

const updateSubscriptionAndUser = async (
  adapter: WebhookContext['adapter'],
  subscriptionId: string,
  userId: string,
  status: string,
  extraUserFields?: Record<string, unknown>
): Promise<void> => {
  await adapter.update({
    model: 'razorpaySubscription',
    where: [{ field: 'subscriptionId', value: subscriptionId }],
    update: { status },
  })

  await adapter.update({
    model: 'user',
    where: [{ field: 'id', value: userId }],
    update: { subscriptionStatus: status, ...extraUserFields },
  })
}

const createStatusHandler =
  (
    status: string,
    extraUserFields?: (sub: SubscriptionEntity) => Record<string, unknown>
  ): EventHandler =>
  async (adapter, subscriptionId, userId, subscription) => {
    const extra = extraUserFields ? extraUserFields(subscription) : {}
    await updateSubscriptionAndUser(adapter, subscriptionId, userId, status, extra)
  }

const eventHandlers: Record<string, EventHandler> = {
  'subscription.authenticated': createStatusHandler('authenticated', (sub) => ({
    subscriptionId: sub.id,
    subscriptionPlanId: sub.plan_id,
  })),
  'subscription.activated': createStatusHandler('active', (sub) => ({
    subscriptionId: sub.id,
    subscriptionPlanId: sub.plan_id,
  })),
  'subscription.charged': createStatusHandler('active', (sub) => ({
    lastPaymentDate: new Date(),
    nextBillingDate: sub.current_end ? new Date(sub.current_end * 1000) : null,
    subscriptionCurrentPeriodEnd: sub.current_end ? new Date(sub.current_end * 1000) : null,
  })),
  'subscription.cancelled': createStatusHandler('cancelled', () => ({ cancelAtPeriodEnd: false })),
  'subscription.paused': createStatusHandler('paused'),
  'subscription.resumed': createStatusHandler('active'),
  'subscription.pending': createStatusHandler('pending'),
  'subscription.halted': createStatusHandler('halted'),
}

const getRawBody = async (request: Request | undefined, fallbackBody: unknown): Promise<string> => {
  if (!request) {
    return JSON.stringify(fallbackBody)
  }

  try {
    const clonedRequest = request.clone()
    const text = await clonedRequest.text()
    return text || JSON.stringify(fallbackBody)
  } catch {
    return JSON.stringify(fallbackBody)
  }
}

const verifySignature = (rawBody: string, signature: string, secret: string): boolean => {
  const expectedSignature = createHmac('sha256', secret).update(rawBody).digest('hex')
  return signature === expectedSignature
}

const invokeCallback = async (
  onWebhookEvent: OnWebhookEventCallback,
  adapter: WebhookContext['adapter'],
  event: string,
  subscription: SubscriptionEntity,
  payload: { payment?: { entity?: { id: string; amount: number; currency?: string } } },
  userId: string
): Promise<void> => {
  const user = (await adapter.findOne({
    model: 'user',
    where: [{ field: 'id', value: userId }],
  })) as { id: string; email: string; name: string } | null

  if (!user) return

  await onWebhookEvent(
    {
      event: event as Parameters<OnWebhookEventCallback>[0]['event'],
      subscription: {
        id: subscription.id,
        plan_id: subscription.plan_id,
        status: subscription.status,
        current_start: subscription.current_start,
        current_end: subscription.current_end,
      },
      payment: payload.payment?.entity
        ? {
            id: payload.payment.entity.id,
            amount: payload.payment.entity.amount,
            currency: payload.payment.entity.currency || 'INR',
          }
        : undefined,
    },
    { userId, user: { id: user.id, email: user.email, name: user.name } }
  )
}

/**
 * Handles Razorpay webhook events for subscription lifecycle management.
 *
 * @param webhookSecret - Optional webhook secret for signature verification
 * @param onWebhookEvent - Optional callback function invoked after webhook processing
 * @returns A Better Auth endpoint handler
 *
 * @remarks
 * This endpoint:
 * - Verifies webhook signature using HMAC SHA256
 * - Processes subscription events (authenticated, activated, charged, cancelled, paused, resumed, etc.)
 * - Updates subscription and user records based on event type
 * - Invokes optional callback for custom business logic
 * - Does not require authentication (webhook endpoint)
 *
 * @example
 * Supported events:
 * - subscription.authenticated
 * - subscription.activated
 * - subscription.charged
 * - subscription.cancelled
 * - subscription.paused
 * - subscription.resumed
 * - subscription.pending
 * - subscription.halted
 */
export const webhook = (webhookSecret?: string, onWebhookEvent?: OnWebhookEventCallback) =>
  createAuthEndpoint('/razorpay/webhook', { method: 'POST' }, async (_ctx) => {
    if (!webhookSecret) {
      return { success: false, message: 'Webhook secret not configured' }
    }

    const signature = _ctx.request?.headers.get('x-razorpay-signature')
    if (!signature) {
      return { success: false, message: 'Missing webhook signature' }
    }

    const rawBody = await getRawBody(_ctx.request, _ctx.body)

    if (!verifySignature(rawBody, signature, webhookSecret)) {
      return { success: false, message: 'Invalid webhook signature' }
    }

    return processWebhookEvent(_ctx.context.adapter, rawBody, _ctx.body, onWebhookEvent)
  })

const processWebhookEvent = async (
  adapter: WebhookContext['adapter'],
  rawBody: string,
  fallbackBody: unknown,
  onWebhookEvent?: OnWebhookEventCallback
): Promise<WebhookResult> => {
  const isDev = process.env.NODE_ENV === 'development'

  try {
    const webhookData = rawBody ? JSON.parse(rawBody) : fallbackBody
    const { event, payload } = webhookData

    if (!event || !payload) {
      return {
        success: false,
        message: isDev
          ? 'Invalid webhook payload: missing event or payload'
          : 'Invalid webhook payload',
      }
    }

    const subscription = payload.subscription?.entity as SubscriptionEntity | undefined
    if (!subscription) {
      return {
        success: false,
        message: isDev
          ? 'Invalid webhook payload: missing subscription data'
          : 'Invalid webhook payload',
      }
    }

    const subscriptionRecord = (await adapter.findOne({
      model: 'razorpaySubscription',
      where: [{ field: 'subscriptionId', value: subscription.id }],
    })) as { userId?: string } | null

    if (!subscriptionRecord) {
      return {
        success: false,
        message: isDev
          ? `Subscription record not found for subscription ${subscription.id}`
          : 'Subscription record not found',
      }
    }

    const userId = subscriptionRecord.userId
    if (!userId) {
      return {
        success: false,
        message: isDev
          ? `User ID not found in subscription record for subscription ${subscription.id}`
          : 'User ID not found in subscription record',
      }
    }

    const handler = eventHandlers[event]
    if (!handler) {
      return {
        success: false,
        message: isDev ? `Unhandled event: ${event}` : 'Unhandled webhook event',
      }
    }

    await handler(adapter, subscription.id, userId, subscription)

    if (onWebhookEvent) {
      try {
        await invokeCallback(onWebhookEvent, adapter, event, subscription, payload, userId)
      } catch {
        // Silently handle callback errors - they shouldn't break webhook processing
        // The callback is for custom logic and failures there shouldn't affect core functionality
      }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Webhook processing failed',
    }
  }
}
