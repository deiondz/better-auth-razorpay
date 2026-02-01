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
  /** Razorpay plan ID (e.g. plan_xxx) for the subscription. */
  planId?: string | null
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

/** Price details for a plan variant (from Razorpay Plan API). Amount is in smallest currency unit (e.g. paise, cents). */
export interface PlanPriceDetail {
  /** Amount in smallest currency unit (e.g. 89900 = ₹899.00, 1000 = $10.00). */
  amount: number
  currency: string
  /** Billing period: daily | weekly | monthly | quarterly | yearly. */
  period: string
  /** Billing interval (e.g. 1 for every 1 month, 2 for every 2 months). */
  interval?: number
}

/** Named plan with monthly/annual Razorpay plan IDs and optional trial. */
export interface RazorpayPlan {
  name: string
  monthlyPlanId: string
  annualPlanId?: string
  description?: string
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

/** Main plugin options: client or credentials, webhook secret, customer creation, subscription config, callbacks. */
export interface RazorpayPluginOptions {
  /** Initialized Razorpay client instance. Omit if using razorpayKeyId + razorpayKeySecret (plugin creates the instance). */
  razorpayClient?: import('razorpay')
  /** Razorpay API key ID. Required when razorpayClient is not provided; plugin creates the Razorpay instance. */
  razorpayKeyId?: string
  /** Razorpay API key secret. Required when razorpayClient is not provided (plugin creates the instance). When set, also enables POST /razorpay/verify-payment (same as Razorpay client secret, not webhook secret). */
  razorpayKeySecret?: string
  /** Webhook secret for signature verification. */
  razorpayWebhookSecret?: string
  /** Create Razorpay customer when user signs up. Default: false. */
  createCustomerOnSignUp?: boolean
  /**
   * Optional. When set with createCustomerOnSignUp, creates an app-level trial subscription at sign-up (no Razorpay subscription until user subscribes).
   * Omit for no sign-up trial. Only applies when both createCustomerOnSignUp and trialOnSignUp are set.
   * @property days - Trial length in days (e.g. 7, 14, 30). Required when trialOnSignUp is set.
   * @property planName - Display name for the trial in the subscription list (e.g. "Trial", "Free trial"). Default: "Trial".
   */
  trialOnSignUp?: { days: number; planName?: string }
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
