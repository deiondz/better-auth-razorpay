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
  GetPlansResponse,
  ListSubscriptionsResponse,
  CreateOrUpdateSubscriptionResponse,
  CancelSubscriptionResponse,
  RestoreSubscriptionResponse,
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

/** Fetch plans (GET /razorpay/get-plans). */
async function fetchPlans(client: RazorpayAuthClient): Promise<PlanSummary[]> {
  const res = await client.api.get(`${BASE}/get-plans`)
  assertSuccess<PlanSummary[]>(res)
  return res.data
}

/** Fetch subscriptions list (GET /razorpay/subscription/list). */
async function fetchSubscriptions(
  client: RazorpayAuthClient,
  input?: ListSubscriptionsInput
): Promise<ListSubscriptionsResponse['data']> {
  const query: Record<string, string> = {}
  if (input?.referenceId) query.referenceId = input.referenceId
  const path = `${BASE}/subscription/list`
  const res =
    Object.keys(query).length > 0
      ? await client.api.get(path, { query })
      : await client.api.get(path)
  assertSuccess<ListSubscriptionsResponse['data']>(res)
  return res.data
}

/** Create or update subscription (POST /razorpay/subscription/create-or-update). */
async function createOrUpdateSubscription(
  client: RazorpayAuthClient,
  input: CreateOrUpdateSubscriptionInput
): Promise<CreateOrUpdateSubscriptionResponse['data']> {
  const res = await client.api.post(`${BASE}/subscription/create-or-update`, {
    body: input as unknown as Record<string, unknown>,
  })
  assertSuccess<CreateOrUpdateSubscriptionResponse['data']>(res)
  return res.data
}

/** Cancel subscription (POST /razorpay/subscription/cancel). */
async function cancelSubscription(
  client: RazorpayAuthClient,
  input: CancelSubscriptionInput
): Promise<CancelSubscriptionResponse['data']> {
  const res = await client.api.post(`${BASE}/subscription/cancel`, {
    body: input as unknown as Record<string, unknown>,
  })
  assertSuccess<CancelSubscriptionResponse['data']>(res)
  return res.data
}

/** Restore subscription (POST /razorpay/subscription/restore). */
async function restoreSubscription(
  client: RazorpayAuthClient,
  input: RestoreSubscriptionInput
): Promise<RestoreSubscriptionResponse['data']> {
  const res = await client.api.post(`${BASE}/subscription/restore`, {
    body: input as unknown as Record<string, unknown>,
  })
  assertSuccess<RestoreSubscriptionResponse['data']>(res)
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
  PlanSummary,
  CreateOrUpdateSubscriptionInput,
  CancelSubscriptionInput,
  RestoreSubscriptionInput,
  ListSubscriptionsInput,
  GetPlansResponse,
  ListSubscriptionsResponse,
  CreateOrUpdateSubscriptionResponse,
  CancelSubscriptionResponse,
  RestoreSubscriptionResponse,
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
