/**
 * Client-side types for Razorpay plugin hooks and API responses.
 */

import type { SubscriptionRecord } from '../lib/types'

/** Plan summary returned by GET /razorpay/get-plans (client-safe shape). */
export interface PlanSummary {
  name: string
  monthlyPlanId: string
  annualPlanId?: string
  limits?: Record<string, number>
  freeTrial?: { days: number }
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

/** Response shape for create-or-update (success). */
export interface CreateOrUpdateSubscriptionResponse {
  success: true
  data: {
    checkoutUrl: string
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
 * When using the client plugin (razorpayClientPlugin()), authClient.razorpay is set and hooks use it so requests hit the correct paths (avoids 404s from api.get/post).
 */
export interface RazorpayAuthClient {
  api: {
    get: (
      path: string,
      options?: { query?: Record<string, string> }
    ) => Promise<RazorpayApiResult<unknown>>
    post: (
      path: string,
      options?: { body?: Record<string, unknown> }
    ) => Promise<RazorpayApiResult<unknown>>
  }
  /** Set when razorpayClientPlugin() is used in createAuthClient({ plugins: [razorpayClientPlugin()] }). Prefer these methods over api.get/post. */
  razorpay?: RazorpayClientActions
}

/** Input for create-or-update subscription. */
export interface CreateOrUpdateSubscriptionInput {
  plan: string
  annual?: boolean
  seats?: number
  subscriptionId?: string
  successUrl?: string
  disableRedirect?: boolean
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
