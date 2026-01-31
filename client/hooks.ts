/**
 * React hooks for Razorpay subscription features using TanStack Query.
 * Use with your Better Auth client: usePlans(authClient), useSubscriptions(authClient), etc.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query'
import type {
  RazorpayAuthClient,
  PlanSummary,
  CreateOrUpdateSubscriptionInput,
  CancelSubscriptionInput,
  RestoreSubscriptionInput,
  ListSubscriptionsInput,
  VerifyPaymentInput,
  GetPlansResponse,
  ListSubscriptionsResponse,
  CreateOrUpdateSubscriptionResponse,
  CancelSubscriptionResponse,
  RestoreSubscriptionResponse,
  VerifyPaymentResponse,
  RazorpayApiError,
} from './types'

const BASE = '/razorpay'

/** Query keys for cache invalidation. */
export const razorpayQueryKeys = {
  all: ['razorpay'] as const,
  plans: () => [...razorpayQueryKeys.all, 'plans'] as const,
  subscriptions: (referenceId?: string) =>
    [...razorpayQueryKeys.all, 'subscriptions', referenceId ?? 'me'] as const,
}

function assertSuccess<T>(res: unknown): asserts res is { success: true; data: T } {
  if (res && typeof res === 'object' && 'success' in res) {
    if ((res as { success: boolean }).success) return
    const err = res as RazorpayApiError
    throw new Error(err.error?.description ?? err.error?.code ?? 'Request failed')
  }
  throw new Error('Invalid response')
}

/** Fetch plans (GET /razorpay/get-plans). Prefers client.razorpay when available to avoid 404s. */
async function fetchPlans(client: RazorpayAuthClient): Promise<PlanSummary[]> {
  const res = client.razorpay
    ? await client.razorpay.getPlans()
    : await client.api.get(`${BASE}/get-plans`)
  assertSuccess<PlanSummary[]>(res)
  return res.data
}

/** Fetch subscriptions list (GET /razorpay/subscription/list). Prefers client.razorpay when available. */
async function fetchSubscriptions(
  client: RazorpayAuthClient,
  input?: ListSubscriptionsInput
): Promise<ListSubscriptionsResponse['data']> {
  const res = client.razorpay
    ? await client.razorpay.listSubscriptions(input)
    : (() => {
      const query: Record<string, string> = {}
      if (input?.referenceId) query.referenceId = input.referenceId
      const path = `${BASE}/subscription/list`
      return Object.keys(query).length > 0
        ? client.api.get(path, { query })
        : client.api.get(path)
    })()
  assertSuccess<ListSubscriptionsResponse['data']>(res)
  return res.data
}

/** Create or update subscription (POST /razorpay/subscription/create-or-update). Prefers client.razorpay when available. */
async function createOrUpdateSubscription(
  client: RazorpayAuthClient,
  input: CreateOrUpdateSubscriptionInput
): Promise<CreateOrUpdateSubscriptionResponse['data']> {
  const res = client.razorpay
    ? await client.razorpay.createOrUpdateSubscription(input)
    : await client.api.post(`${BASE}/subscription/create-or-update`, {
      body: input as unknown as Record<string, unknown>,
    })
  assertSuccess<CreateOrUpdateSubscriptionResponse['data']>(res)
  return res.data
}

/** Cancel subscription (POST /razorpay/subscription/cancel). Prefers client.razorpay when available. */
async function cancelSubscription(
  client: RazorpayAuthClient,
  input: CancelSubscriptionInput
): Promise<CancelSubscriptionResponse['data']> {
  const res = client.razorpay
    ? await client.razorpay.cancelSubscription(input)
    : await client.api.post(`${BASE}/subscription/cancel`, {
      body: input as unknown as Record<string, unknown>,
    })
  assertSuccess<CancelSubscriptionResponse['data']>(res)
  return res.data
}

/** Restore subscription (POST /razorpay/subscription/restore). Prefers client.razorpay when available. */
async function restoreSubscription(
  client: RazorpayAuthClient,
  input: RestoreSubscriptionInput
): Promise<RestoreSubscriptionResponse['data']> {
  const res = client.razorpay
    ? await client.razorpay.restoreSubscription(input)
    : await client.api.post(`${BASE}/subscription/restore`, {
      body: input as unknown as Record<string, unknown>,
    })
  assertSuccess<RestoreSubscriptionResponse['data']>(res)
  return res.data
}

/** Verify payment (POST /razorpay/verify-payment). Prefers client.razorpay when available. */
async function verifyPayment(
  client: RazorpayAuthClient,
  input: VerifyPaymentInput
): Promise<VerifyPaymentResponse['data']> {
  const res = client.razorpay
    ? await client.razorpay.verifyPayment(input)
    : await client.api.post(`${BASE}/verify-payment`, {
      body: input as unknown as Record<string, unknown>,
    })
  assertSuccess<VerifyPaymentResponse['data']>(res)
  return res.data
}

export type UsePlansOptions = Omit<
  UseQueryOptions<PlanSummary[], Error, PlanSummary[], readonly string[]>,
  'queryKey' | 'queryFn'
>

/**
 * Fetch configured subscription plans (no auth required).
 */
export function usePlans(
  client: RazorpayAuthClient | null | undefined,
  options?: UsePlansOptions
) {
  return useQuery({
    queryKey: razorpayQueryKeys.plans(),
    queryFn: () => fetchPlans(client!),
    enabled: !!client,
    ...options,
  })
}

export type UseSubscriptionsOptions = Omit<
  UseQueryOptions<
    ListSubscriptionsResponse['data'],
    Error,
    ListSubscriptionsResponse['data'],
    readonly (string | undefined)[]
  >,
  'queryKey' | 'queryFn'
> & { referenceId?: string }

/**
 * List active/trialing subscriptions for the current user (or referenceId).
 */
export function useSubscriptions(
  client: RazorpayAuthClient | null | undefined,
  input?: ListSubscriptionsInput,
  options?: UseSubscriptionsOptions
) {
  const { referenceId, ...queryOptions } = options ?? {}
  const refId = input?.referenceId ?? referenceId
  return useQuery({
    queryKey: razorpayQueryKeys.subscriptions(refId),
    queryFn: () => fetchSubscriptions(client!, input),
    enabled: !!client,
    ...queryOptions,
  })
}

export type UseCreateOrUpdateSubscriptionOptions = UseMutationOptions<
  CreateOrUpdateSubscriptionResponse['data'],
  Error,
  CreateOrUpdateSubscriptionInput,
  unknown
>

/**
 * Create or update a subscription. Returns checkoutUrl for Razorpay payment page.
 * Invalidates subscriptions list on success.
 */
export function useCreateOrUpdateSubscription(
  client: RazorpayAuthClient | null | undefined,
  options?: UseCreateOrUpdateSubscriptionOptions
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOrUpdateSubscriptionInput) =>
      createOrUpdateSubscription(client!, input),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: razorpayQueryKeys.subscriptions() })
      options?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

export type UseCancelSubscriptionOptions = UseMutationOptions<
  CancelSubscriptionResponse['data'],
  Error,
  CancelSubscriptionInput,
  unknown
>

/**
 * Cancel a subscription by local subscription ID (at period end or immediately).
 * Invalidates subscriptions list on success.
 */
export function useCancelSubscription(
  client: RazorpayAuthClient | null | undefined,
  options?: UseCancelSubscriptionOptions
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CancelSubscriptionInput) => cancelSubscription(client!, input),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: razorpayQueryKeys.subscriptions() })
      options?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

export type UseRestoreSubscriptionOptions = UseMutationOptions<
  RestoreSubscriptionResponse['data'],
  Error,
  RestoreSubscriptionInput,
  unknown
>

// Re-export client types for convenience when importing from this entry
export type {
  RazorpayAuthClient,
  RazorpayClientActions,
  PlanSummary,
  CreateOrUpdateSubscriptionInput,
  CancelSubscriptionInput,
  RestoreSubscriptionInput,
  ListSubscriptionsInput,
  VerifyPaymentInput,
  GetPlansResponse,
  ListSubscriptionsResponse,
  CreateOrUpdateSubscriptionResponse,
  CancelSubscriptionResponse,
  RestoreSubscriptionResponse,
  VerifyPaymentResponse,
  RazorpayApiError,
  RazorpayApiResult,
} from './types'

/**
 * Restore a subscription that was scheduled to cancel at period end.
 * Invalidates subscriptions list on success.
 */
export function useRestoreSubscription(
  client: RazorpayAuthClient | null | undefined,
  options?: UseRestoreSubscriptionOptions
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RestoreSubscriptionInput) => restoreSubscription(client!, input),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: razorpayQueryKeys.subscriptions() })
      options?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}

export type UseVerifyPaymentOptions = UseMutationOptions<
  VerifyPaymentResponse['data'],
  Error,
  VerifyPaymentInput,
  unknown
>

/**
 * Verify payment signature after Razorpay checkout success.
 * Call with the payload from the Razorpay success handler (razorpay_payment_id, razorpay_subscription_id, razorpay_signature).
 * Invalidates subscriptions list on success.
 */
export function useVerifyPayment(
  client: RazorpayAuthClient | null | undefined,
  options?: UseVerifyPaymentOptions
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: VerifyPaymentInput) => verifyPayment(client!, input),
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: razorpayQueryKeys.subscriptions() })
      options?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}
