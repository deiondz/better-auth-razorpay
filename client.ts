import type { BetterAuthClientPlugin } from 'better-auth/client'
import type { razorpayPlugin } from './index'
import type {
  PlanSummary,
  CreateOrUpdateSubscriptionInput,
  CancelSubscriptionInput,
  RestoreSubscriptionInput,
  ListSubscriptionsInput,
  VerifyPaymentInput,
  ListSubscriptionsResponse,
  CreateOrUpdateSubscriptionResponse,
  CancelSubscriptionResponse,
  RestoreSubscriptionResponse,
  VerifyPaymentResponse,
  RazorpayApiResult,
} from './client/types'

type FetchFn = (
  path: string,
  options?: {
    method?: string
    body?: Record<string, unknown>
    query?: Record<string, string>
  }
) => Promise<RazorpayApiResult<unknown>>

const PATHS = {
  getPlans: '/razorpay/get-plans',
  listSubscriptions: '/razorpay/subscription/list',
  createOrUpdateSubscription: '/razorpay/subscription/create-or-update',
  cancelSubscription: '/razorpay/subscription/cancel',
  restoreSubscription: '/razorpay/subscription/restore',
  verifyPayment: '/razorpay/verify-payment',
} as const

/**
 * Unwrap Better Auth $fetch result { data, error } into the API body.
 * Success: return res.data (API body: { success, data }).
 * Otherwise return res so errors and non–Better Fetch responses propagate.
 */
function unwrapBetterFetch<T>(res: unknown): T {
  if (
    res != null &&
    typeof res === 'object' &&
    'data' in res &&
    (res as { error?: unknown }).error == null
  ) {
    return (res as { data: T }).data
  }
  return res as T
}

/**
 * Razorpay client plugin for Better Auth.
 * Exposes authClient.razorpay.* so requests use the correct paths and avoid 404s from api.get/post.
 * Unwraps Better Auth's { data, error } so callers get the API body shape ({ success, data } / { success: false, error }).
 * Add to createAuthClient: plugins: [razorpayClientPlugin()]
 */
export const razorpayClientPlugin = () =>
  ({
    id: 'razorpay-plugin',
    $InferServerPlugin: {} as ReturnType<typeof razorpayPlugin>,
    getActions: ($fetch: FetchFn) => ({
      razorpay: {
        getPlans: async (fetchOptions?: Parameters<FetchFn>[1]) =>
          unwrapBetterFetch<RazorpayApiResult<PlanSummary[]>>(
            await $fetch(PATHS.getPlans, { method: 'GET', ...fetchOptions })
          ),

        listSubscriptions: async (
          input?: ListSubscriptionsInput,
          fetchOptions?: Parameters<FetchFn>[1]
        ) =>
          unwrapBetterFetch<RazorpayApiResult<ListSubscriptionsResponse['data']>>(
            await $fetch(PATHS.listSubscriptions, {
              method: 'GET',
              query: input?.referenceId ? { referenceId: input.referenceId } : undefined,
              ...fetchOptions,
            })
          ),

        createOrUpdateSubscription: async (
          input: CreateOrUpdateSubscriptionInput,
          fetchOptions?: Parameters<FetchFn>[1]
        ) =>
          unwrapBetterFetch<
            RazorpayApiResult<CreateOrUpdateSubscriptionResponse['data']>
          >(
            await $fetch(PATHS.createOrUpdateSubscription, {
              method: 'POST',
              body: input as unknown as Record<string, unknown>,
              ...fetchOptions,
            })
          ),

        cancelSubscription: async (
          input: CancelSubscriptionInput,
          fetchOptions?: Parameters<FetchFn>[1]
        ) =>
          unwrapBetterFetch<RazorpayApiResult<CancelSubscriptionResponse['data']>>(
            await $fetch(PATHS.cancelSubscription, {
              method: 'POST',
              body: input as unknown as Record<string, unknown>,
              ...fetchOptions,
            })
          ),

        restoreSubscription: async (
          input: RestoreSubscriptionInput,
          fetchOptions?: Parameters<FetchFn>[1]
        ) =>
          unwrapBetterFetch<RazorpayApiResult<RestoreSubscriptionResponse['data']>>(
            await $fetch(PATHS.restoreSubscription, {
              method: 'POST',
              body: input as unknown as Record<string, unknown>,
              ...fetchOptions,
            })
          ),

        verifyPayment: async (
          input: VerifyPaymentInput,
          fetchOptions?: Parameters<FetchFn>[1]
        ) =>
          unwrapBetterFetch<RazorpayApiResult<VerifyPaymentResponse['data']>>(
            await $fetch(PATHS.verifyPayment, {
              method: 'POST',
              body: input as unknown as Record<string, unknown>,
              ...fetchOptions,
            })
          ),
      },
    }),
  }) satisfies BetterAuthClientPlugin
