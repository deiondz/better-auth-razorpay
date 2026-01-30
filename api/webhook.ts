import { createHmac } from 'node:crypto'
import { createAuthEndpoint } from 'better-auth/api'
import type {
  OnWebhookEventCallback,
  RazorpayPluginOptions,
  RazorpaySubscription,
  SubscriptionRecord,
} from '../lib'

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

interface WebhookAdapter {
  findOne: (params: {
    model: string
    where: { field: string; value: string }[]
  }) => Promise<unknown>
  update: (params: {
    model: string
    where: { field: string; value: string }[]
    update: { data: Record<string, unknown> }
  }) => Promise<unknown>
}

type EventHandler = (
  adapter: WebhookAdapter,
  razorpaySubscriptionId: string,
  record: SubscriptionRecord,
  subscription: SubscriptionEntity
) => Promise<void>

function toLocalStatus(razorpayStatus: string): SubscriptionRecord['status'] {
  const map: Record<string, SubscriptionRecord['status']> = {
    created: 'created',
    authenticated: 'pending',
    active: 'active',
    pending: 'pending',
    halted: 'halted',
    cancelled: 'cancelled',
    completed: 'completed',
    expired: 'expired',
  }
  return map[razorpayStatus] ?? 'pending'
}

const updateSubscriptionRecord = async (
  adapter: WebhookAdapter,
  razorpaySubscriptionId: string,
  data: Record<string, unknown>
): Promise<void> => {
  await adapter.update({
    model: 'subscription',
    where: [{ field: 'razorpaySubscriptionId', value: razorpaySubscriptionId }],
    update: { data: { ...data, updatedAt: new Date() } },
  })
}

const createStatusHandler = (
  status: SubscriptionRecord['status'],
  extraFields?: (sub: SubscriptionEntity) => Record<string, unknown>
): EventHandler =>
  async (adapter, razorpaySubscriptionId, record, subscription) => {
    const periodStart = subscription.current_start
      ? new Date(subscription.current_start * 1000)
      : null
    const periodEnd = subscription.current_end
      ? new Date(subscription.current_end * 1000)
      : null
    await updateSubscriptionRecord(adapter, razorpaySubscriptionId, {
      status,
      ...(periodStart !== null && { periodStart }),
      ...(periodEnd !== null && { periodEnd }),
      ...(extraFields?.(subscription) ?? {}),
    })
  }

const eventHandlers: Record<string, EventHandler> = {
  'subscription.authenticated': createStatusHandler('pending'),
  'subscription.activated': createStatusHandler('active'),
  'subscription.charged': createStatusHandler('active', (sub) => ({
    periodEnd: sub.current_end ? new Date(sub.current_end * 1000) : undefined,
  })),
  'subscription.cancelled': createStatusHandler('cancelled', () => ({ cancelAtPeriodEnd: false })),
  'subscription.paused': createStatusHandler('halted'),
  'subscription.resumed': createStatusHandler('active'),
  'subscription.pending': createStatusHandler('pending'),
  'subscription.halted': createStatusHandler('halted'),
  'subscription.expired': createStatusHandler('expired'),
}

const getRawBody = async (request: Request | undefined, fallbackBody: unknown): Promise<string> => {
  if (!request) return JSON.stringify(fallbackBody)
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
  adapter: WebhookAdapter,
  event: string,
  subscription: SubscriptionEntity,
  payload: { payment?: { entity?: { id: string; amount: number; currency?: string } } },
  userId: string
): Promise<void> => {
  const user = (await adapter.findOne({
    model: 'user',
    where: [{ field: 'id', value: userId }],
  })) as { id: string; email?: string; name?: string } | null
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
            currency: payload.payment.entity.currency ?? 'INR',
          }
        : undefined,
    },
    { userId, user: { id: user.id, email: user.email, name: user.name } }
  )
}

/**
 * Handles Razorpay webhook events for subscription lifecycle.
 * Updates the subscription model only (no user subscription fields).
 */
export const webhook = (
  webhookSecret: string | undefined,
  onWebhookEvent: OnWebhookEventCallback | undefined,
  pluginOptions: Pick<RazorpayPluginOptions, 'subscription' | 'onEvent'>
) =>
  createAuthEndpoint('/razorpay/webhook', { method: 'POST' }, async (ctx) => {
    if (!webhookSecret) {
      return { success: false, message: 'Webhook secret not configured' }
    }
    const signature = ctx.request?.headers.get('x-razorpay-signature')
    if (!signature) {
      return { success: false, message: 'Missing webhook signature' }
    }
    const rawBody = await getRawBody(ctx.request, ctx.body)
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      return { success: false, message: 'Invalid webhook signature' }
    }
    return processWebhookEvent(
      ctx.context.adapter as unknown as WebhookAdapter,
      rawBody,
      ctx.body,
      onWebhookEvent,
      pluginOptions
    )
  })

async function processWebhookEvent(
  adapter: WebhookAdapter,
  rawBody: string,
  fallbackBody: unknown,
  onWebhookEvent?: OnWebhookEventCallback,
  pluginOptions?: Pick<RazorpayPluginOptions, 'subscription' | 'onEvent'>
): Promise<WebhookResult> {
  const isDev = process.env.NODE_ENV === 'development'
  try {
    const webhookData = rawBody ? JSON.parse(rawBody) : fallbackBody
    const { event, payload } = webhookData
    if (!event || !payload) {
      return {
        success: false,
        message: isDev ? 'Invalid webhook payload: missing event or payload' : 'Invalid webhook payload',
      }
    }

    const subscriptionEntity = payload.subscription?.entity as SubscriptionEntity | undefined
    if (!subscriptionEntity) {
      return {
        success: false,
        message: isDev ? 'Invalid webhook payload: missing subscription data' : 'Invalid webhook payload',
      }
    }

    const record = (await adapter.findOne({
      model: 'subscription',
      where: [{ field: 'razorpaySubscriptionId', value: subscriptionEntity.id }],
    })) as SubscriptionRecord | null

    if (!record) {
      return {
        success: false,
        message: isDev
          ? `Subscription record not found for ${subscriptionEntity.id}`
          : 'Subscription record not found',
      }
    }

    const userId = record.referenceId
    if (!userId) {
      return {
        success: false,
        message: isDev ? 'referenceId not found on subscription record' : 'Invalid subscription record',
      }
    }

    const handler = eventHandlers[event]
    if (!handler) {
      return {
        success: false,
        message: isDev ? `Unhandled event: ${event}` : 'Unhandled webhook event',
      }
    }

    await handler(adapter, subscriptionEntity.id, record, subscriptionEntity)

    if (pluginOptions?.onEvent) {
      try {
        await pluginOptions.onEvent({ event, ...payload })
      } catch {
        // ignore
      }
    }

    if (pluginOptions?.subscription) {
      const sub = pluginOptions.subscription
      const rpSub = {
        id: subscriptionEntity.id,
        plan_id: subscriptionEntity.plan_id,
        status: subscriptionEntity.status,
        current_start: subscriptionEntity.current_start,
        current_end: subscriptionEntity.current_end,
      } as RazorpaySubscription
      const updatedRecord = { ...record, status: toLocalStatus(subscriptionEntity.status) }
      try {
        if (event === 'subscription.activated' && sub.onSubscriptionActivated) {
          await sub.onSubscriptionActivated({
            event,
            razorpaySubscription: rpSub,
            subscription: updatedRecord as SubscriptionRecord,
            plan: { name: record.plan, monthlyPlanId: subscriptionEntity.plan_id },
          })
        } else if (
          ['subscription.cancelled', 'subscription.expired'].includes(event) &&
          sub.onSubscriptionCancel
        ) {
          await sub.onSubscriptionCancel({
            event,
            razorpaySubscription: rpSub,
            subscription: updatedRecord as SubscriptionRecord,
          })
        } else if (sub.onSubscriptionUpdate) {
          await sub.onSubscriptionUpdate({ event, subscription: updatedRecord as SubscriptionRecord })
        }
      } catch {
        // ignore callback errors
      }
    }

    if (onWebhookEvent) {
      try {
        await invokeCallback(
          onWebhookEvent,
          adapter,
          event,
          subscriptionEntity,
          payload,
          userId
        )
      } catch {
        // ignore
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
