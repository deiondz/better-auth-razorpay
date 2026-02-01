/**
 * Client-side types for Razorpay plugin hooks and API responses.
 */

import type { PlanPriceDetail, SubscriptionRecord } from '../lib/types'

export type { PlanPriceDetail }

/** Plan summary returned by GET /razorpay/get-plans (client-safe shape). */
export interface PlanSummary {
  name: string
  monthlyPlanId: string
  annualPlanId?: string
  description?: string
  limits?: Record<string, number>
  freeTrial?: { days: number }
  /** Price for monthly plan (from Razorpay). Omitted if fetch failed or unavailable. */
  monthly?: PlanPriceDetail
  /** Price for annual plan (from Razorpay). Omitted if not configured or fetch failed. */
  annual?: PlanPriceDetail
}

/** Response shape for get-plans (success). */
export interface GetPlansResponse {
  success: true
  data: PlanSummary[]
}

/** Response shape for subscription/list (success). */
export interface ListSubscriptionsResponse {
  success: true
  data: SubscriptionRecord[]
}

/** Response shape for create-or-update (success). When `embed: true`, checkoutUrl is omitted; use openRazorpaySubscriptionCheckout with razorpaySubscriptionId for in-page modal. */
export interface CreateOrUpdateSubscriptionResponse {
  success: true
  data: {
    /** Present when not using embed; omit when embed is true (use in-page modal instead). */
    checkoutUrl?: string | null
    subscriptionId: string
    razorpaySubscriptionId: string
  }
}

/** Response shape for cancel (success). */
export interface CancelSubscriptionResponse {
  success: true
  data: {
    id: string
    status: string
    plan_id: string
    current_end?: number
    ended_at?: number | null
  }
}

/** Response shape for restore (success). */
export interface RestoreSubscriptionResponse {
  success: true
  data: { id: string; status: string }
}

/** Error shape from plugin API. */
export interface RazorpayApiError {
  success: false
  error: { code: string; description: string; [key: string]: unknown }
}

/** Any plugin API response (success or error). */
export type RazorpayApiResult<T = unknown> =
  | { success: true; data: T }
  | RazorpayApiError

/** Razorpay API actions from the client plugin (authClient.razorpay). Use these so requests hit the correct paths. */
export interface RazorpayClientActions {
  getPlans: (fetchOptions?: { query?: Record<string, string> }) => Promise<RazorpayApiResult<PlanSummary[]>>
  listSubscriptions: (
    input?: ListSubscriptionsInput,
    fetchOptions?: { query?: Record<string, string> }
  ) => Promise<RazorpayApiResult<ListSubscriptionsResponse['data']>>
  createOrUpdateSubscription: (
    input: CreateOrUpdateSubscriptionInput,
    fetchOptions?: { body?: Record<string, unknown> }
  ) => Promise<RazorpayApiResult<CreateOrUpdateSubscriptionResponse['data']>>
  cancelSubscription: (
    input: CancelSubscriptionInput,
    fetchOptions?: { body?: Record<string, unknown> }
  ) => Promise<RazorpayApiResult<CancelSubscriptionResponse['data']>>
  restoreSubscription: (
    input: RestoreSubscriptionInput,
    fetchOptions?: { body?: Record<string, unknown> }
  ) => Promise<RazorpayApiResult<RestoreSubscriptionResponse['data']>>
  verifyPayment: (
    input: VerifyPaymentInput,
    fetchOptions?: { body?: Record<string, unknown> }
  ) => Promise<RazorpayApiResult<VerifyPaymentResponse['data']>>
}

/**
 * Minimal auth client interface for Razorpay hooks.
 * Primary: razorpay is set when razorpayClientPlugin() is used in createAuthClient({ plugins: [...] }); prefer it so requests hit the correct paths.
 * Fallback: api is optional for custom clients that implement path-based api.get/api.post.
 */
export interface RazorpayAuthClient {
  /** Set when razorpayClientPlugin() is used in createAuthClient({ plugins: [razorpayClientPlugin()] }). Prefer these methods over api.get/post. */
  razorpay?: RazorpayClientActions
  /** Optional; for custom clients that implement path-based api.get/post. */
  api?: {
    get: (
      path: string,
      options?: { query?: Record<string, string> }
    ) => Promise<RazorpayApiResult<unknown>>
    post: (
      path: string,
      options?: { body?: Record<string, unknown> }
    ) => Promise<RazorpayApiResult<unknown>>
  }
}

/** Input for create-or-update subscription. */
export interface CreateOrUpdateSubscriptionInput {
  plan: string
  annual?: boolean
  seats?: number
  subscriptionId?: string
  successUrl?: string
  disableRedirect?: boolean
  /** When true, checkout runs in-page via Razorpay modal; no redirect to checkoutUrl. */
  embed?: boolean
}

/** Input for cancel subscription. */
export interface CancelSubscriptionInput {
  subscriptionId: string
  immediately?: boolean
}

/** Input for restore subscription. */
export interface RestoreSubscriptionInput {
  subscriptionId: string
}

/** Input for list subscriptions (query). */
export interface ListSubscriptionsInput {
  referenceId?: string
}

/** Input for verify-payment (Razorpay checkout success callback payload). */
export interface VerifyPaymentInput {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

/** Response shape for verify-payment (success). */
export interface VerifyPaymentResponse {
  success: true
  data: {
    message: string
    payment_id: string
    subscription_id: string
  }
}
