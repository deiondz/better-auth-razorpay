/**
 * Razorpay subscription response interface from the Razorpay API.
 * This represents the full subscription object returned by Razorpay API calls.
 */
export interface RazorpaySubscription {
  id: string
  entity: string
  plan_id: string
  status: string
  current_start: number
  current_end: number
  ended_at: number | null
  quantity: number
  notes: Record<string, string> | null
  charge_at: number
  start_at: number
  end_at: number
  auth_attempts: number
  total_count: number
  paid_count: number
  customer_notify: boolean
  created_at: number
  expire_by: number | null
  short_url: string
  has_scheduled_changes: boolean
  change_scheduled_at: number | null
  source: string
  offer_id: string | null
  remaining_count: string
}

/**
 * Subscription record stored in the auth adapter.
 */
export interface RazorpaySubscriptionRecord {
  userId: string
  subscriptionId: string
  planId: string
  status: string
}

/**
 * User record shape used by the Razorpay plugin.
 */
export interface RazorpayUserRecord {
  id: string
  email?: string
  name?: string
  subscriptionId?: string
  subscriptionPlanId?: string
  subscriptionStatus?: string
  subscriptionCurrentPeriodEnd?: Date | null
  cancelAtPeriodEnd?: boolean
  lastPaymentDate?: Date | null
  nextBillingDate?: Date | null
}

type RazorpayWebhookEvent =
  | 'subscription.authenticated'
  | 'subscription.activated'
  | 'subscription.charged'
  | 'subscription.cancelled'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'subscription.pending'
  | 'subscription.halted'

interface RazorpayWebhookPayload {
  event: RazorpayWebhookEvent
  subscription: {
    id: string
    plan_id: string
    status: string
    current_start?: number
    current_end?: number
    [key: string]: unknown // Allow other Razorpay subscription fields
  }
  payment?: {
    id: string
    amount: number
    currency: string
    [key: string]: unknown // Allow other Razorpay payment fields
  }
}

interface RazorpayWebhookContext {
  userId: string
  user: {
    id: string
    email: string
    name: string
    [key: string]: unknown // Allow other user fields
  }
}

/**
 * Callback function invoked after webhook events are processed.
 * Can be used for any custom logic: emails, notifications, analytics, integrations, etc.
 */
type OnWebhookEventCallback = (
  payload: RazorpayWebhookPayload,
  context: RazorpayWebhookContext
) => Promise<void>

interface RazorpayPluginOptions {
  keyId: string
  keySecret: string
  webhookSecret?: string
  plans: string[] // Array of plan IDs from Razorpay dashboard
  /**
   * Optional callback function invoked after webhook events are processed.
   * Use this for any custom logic: sending emails, updating external systems,
   * analytics tracking, integrations, or any other business logic.
   */
  onWebhookEvent?: OnWebhookEventCallback
}

/**
 * Standard success response structure for Razorpay API endpoints.
 */
export interface RazorpaySuccessResponse<T = unknown> {
  success: true
  data: T
}

/**
 * Standard error response structure for Razorpay API endpoints.
 */
export interface RazorpayErrorResponse {
  success: false
  error: {
    code: string
    description: string
    [key: string]: unknown // Allow additional error metadata
  }
}

/**
 * Union type for all Razorpay API responses.
 */
export type RazorpayApiResponse<T = unknown> =
  | RazorpaySuccessResponse<T>
  | RazorpayErrorResponse

export type {
  RazorpayPluginOptions,
  RazorpayWebhookEvent,
  RazorpayWebhookPayload,
  RazorpayWebhookContext,
  OnWebhookEventCallback,
}
