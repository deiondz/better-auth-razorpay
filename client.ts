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
 * Razorpay client plugin for Better Auth.
 * Exposes authClient.razorpay.* so requests use the correct paths and avoid 404s from api.get/post.
 * Add to createAuthClient: plugins: [razorpayClientPlugin()]
 */
export const razorpayClientPlugin = () =>
  ({
    id: 'razorpay-plugin',
    $InferServerPlugin: {} as ReturnType<typeof razorpayPlugin>,
    getActions: ($fetch: FetchFn) => ({
      razorpay: {
        getPlans: (fetchOptions?: Parameters<FetchFn>[1]) =>
          $fetch(PATHS.getPlans, { method: 'GET', ...fetchOptions }) as Promise<
            RazorpayApiResult<PlanSummary[]>
          >,

        listSubscriptions: (
          input?: ListSubscriptionsInput,
          fetchOptions?: Parameters<FetchFn>[1]
        ) =>
          $fetch(PATHS.listSubscriptions, {
            method: 'GET',
            query: input?.referenceId ? { referenceId: input.referenceId } : undefined,
            ...fetchOptions,
          }) as Promise<RazorpayApiResult<ListSubscriptionsResponse['data']>>,

        createOrUpdateSubscription: (
          input: CreateOrUpdateSubscriptionInput,
          fetchOptions?: Parameters<FetchFn>[1]
        ) =>
          $fetch(PATHS.createOrUpdateSubscription, {
            method: 'POST',
            body: input as unknown as Record<string, unknown>,
            ...fetchOptions,
          }) as Promise<
            RazorpayApiResult<CreateOrUpdateSubscriptionResponse['data']>
          >,

        cancelSubscription: (
          input: CancelSubscriptionInput,
          fetchOptions?: Parameters<FetchFn>[1]
        ) =>
          $fetch(PATHS.cancelSubscription, {
            method: 'POST',
            body: input as unknown as Record<string, unknown>,
            ...fetchOptions,
          }) as Promise<RazorpayApiResult<CancelSubscriptionResponse['data']>>,

        restoreSubscription: (
          input: RestoreSubscriptionInput,
          fetchOptions?: Parameters<FetchFn>[1]
        ) =>
          $fetch(PATHS.restoreSubscription, {
            method: 'POST',
            body: input as unknown as Record<string, unknown>,
            ...fetchOptions,
          }) as Promise<RazorpayApiResult<RestoreSubscriptionResponse['data']>>,

        verifyPayment: (
          input: VerifyPaymentInput,
          fetchOptions?: Parameters<FetchFn>[1]
        ) =>
          $fetch(PATHS.verifyPayment, {
            method: 'POST',
            body: input as unknown as Record<string, unknown>,
            ...fetchOptions,
          }) as Promise<RazorpayApiResult<VerifyPaymentResponse['data']>>,
      },
    }),
  }) satisfies BetterAuthClientPlugin
