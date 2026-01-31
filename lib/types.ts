/**
 * Razorpay subscription response from the Razorpay API.
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

/** Local subscription status aligned with Razorpay and plugin lifecycle. */
export type SubscriptionStatus =
  | 'created'
  | 'active'
  | 'pending'
  | 'halted'
  | 'cancelled'
  | 'completed'
  | 'expired'
  | 'trialing'

/** Local subscription record stored in the auth adapter. */
export interface SubscriptionRecord {
  id: string
  plan: string
  referenceId: string
  razorpayCustomerId?: string | null
  razorpaySubscriptionId?: string | null
  status: SubscriptionStatus
  trialStart?: Date | null
  trialEnd?: Date | null
  periodStart?: Date | null
  periodEnd?: Date | null
  cancelAtPeriodEnd: boolean
  seats: number
  groupId?: string | null
  createdAt: Date
  updatedAt: Date
}

/** Plan limits (customizable per plan). */
export interface PlanLimits {
  [key: string]: number
}

/** Free trial configuration for a plan. */
export interface PlanFreeTrial {
  days: number
  onTrialStart?: (subscription: SubscriptionRecord) => Promise<void>
  onTrialEnd?: (args: { subscription: SubscriptionRecord }) => Promise<void>
}

/** Named plan with monthly/annual Razorpay plan IDs and optional trial. */
export interface RazorpayPlan {
  name: string
  monthlyPlanId: string
  annualPlanId?: string
  limits?: PlanLimits
  freeTrial?: PlanFreeTrial
}

/** Subscription plugin options (plans, callbacks, authorization). */
export interface SubscriptionOptions {
  enabled: boolean
  plans: RazorpayPlan[] | (() => Promise<RazorpayPlan[]>)
  requireEmailVerification?: boolean
  authorizeReference?: (args: {
    user: { id: string; email?: string; name?: string; [key: string]: unknown }
    referenceId: string
    action: string
  }) => Promise<boolean>
  getSubscriptionCreateParams?: (args: {
    user: { id: string; email?: string; name?: string; [key: string]: unknown }
    session: unknown
    plan: RazorpayPlan
    subscription: SubscriptionRecord
  }) => Promise<{ params?: Record<string, unknown> }>
  onSubscriptionCreated?: (args: {
    razorpaySubscription: RazorpaySubscription
    subscription: SubscriptionRecord
    plan: RazorpayPlan
  }) => Promise<void>
  onSubscriptionActivated?: (args: {
    event: string
    razorpaySubscription: RazorpaySubscription
    subscription: SubscriptionRecord
    plan: RazorpayPlan
  }) => Promise<void>
  onSubscriptionUpdate?: (args: { event: string; subscription: SubscriptionRecord }) => Promise<void>
  onSubscriptionCancel?: (args: {
    event: string
    razorpaySubscription: RazorpaySubscription
    subscription: SubscriptionRecord
  }) => Promise<void>
}

/** User record shape used by the Razorpay plugin (customer ID on user). */
export interface RazorpayUserRecord {
  id: string
  email?: string
  name?: string
  razorpayCustomerId?: string | null
  [key: string]: unknown
}

/** Razorpay webhook event types. */
export type RazorpayWebhookEvent =
  | 'subscription.authenticated'
  | 'subscription.activated'
  | 'subscription.charged'
  | 'subscription.cancelled'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'subscription.pending'
  | 'subscription.halted'
  | 'subscription.expired'

export interface RazorpayWebhookPayload {
  event: RazorpayWebhookEvent
  subscription: {
    id: string
    plan_id: string
    status: string
    current_start?: number
    current_end?: number
    [key: string]: unknown
  }
  payment?: {
    id: string
    amount: number
    currency: string
    [key: string]: unknown
  }
}

export interface RazorpayWebhookContext {
  userId: string
  user: { id: string; email?: string; name?: string; [key: string]: unknown }
}

export type OnWebhookEventCallback = (
  payload: RazorpayWebhookPayload,
  context: RazorpayWebhookContext
) => Promise<void>

/** Main plugin options: client, webhook secret, customer creation, subscription config, callbacks. */
export interface RazorpayPluginOptions {
  /** Initialized Razorpay client instance. */
  razorpayClient: import('razorpay')
  /** Webhook secret for signature verification. */
  razorpayWebhookSecret?: string
  /** API key secret for payment signature verification. When set, enables POST /razorpay/verify-payment (same secret as Razorpay client, not webhook secret). */
  razorpayKeySecret?: string
  /** Create Razorpay customer when user signs up. Default: false. */
  createCustomerOnSignUp?: boolean
  /** Called after a Razorpay customer is created. */
  onCustomerCreate?: (args: {
    user: RazorpayUserRecord
    razorpayCustomer: { id: string; [key: string]: unknown }
  }) => Promise<void>
  /** Custom params (e.g. notes) when creating Razorpay customer. */
  getCustomerCreateParams?: (args: {
    user: RazorpayUserRecord
    session: unknown
  }) => Promise<{ params?: Record<string, unknown> }>
  /** Subscription feature config (plans, callbacks). */
  subscription?: SubscriptionOptions
  /** Global callback for all processed webhook events. */
  onEvent?: (event: { event: string; [key: string]: unknown }) => Promise<void>
  /** Legacy: callback after webhook events are processed (payload + context). */
  onWebhookEvent?: OnWebhookEventCallback
}

export interface RazorpaySuccessResponse<T = unknown> {
  success: true
  data: T
}

export interface RazorpayErrorResponse {
  success: false
  error: { code: string; description: string; [key: string]: unknown }
}

export type RazorpayApiResponse<T = unknown> =
  | RazorpaySuccessResponse<T>
  | RazorpayErrorResponse
