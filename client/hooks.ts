/**
 * React hooks for Razorpay subscription features using TanStack Query.
 * Wrap your app with <RazorpayAuthProvider client={authClient}> and use usePlans(), useSubscriptions(), etc. with no client argument.
 */

import { createContext, useContext, createElement, type ReactNode } from 'react'
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

const RAZORPAY_NO_CLIENT_MESSAGE =
  'Razorpay hooks require wrapping your app with <RazorpayAuthProvider client={authClient}>.'

const RAZORPAY_NO_RAZORPAY_OR_API_MESSAGE =
  'Razorpay hooks require a client created with razorpayClientPlugin() in createAuthClient({ plugins: [...] }).'

/** Context holding the Razorpay-capable auth client. Default is null. */
export const RazorpayAuthContext = createContext<RazorpayAuthClient | null>(null)

/** Provider that supplies the auth client to Razorpay hooks. Wrap your app once with client={authClient}. */
export function RazorpayAuthProvider({
  client,
  children,
}: {
  client: RazorpayAuthClient | null
  children: ReactNode
}) {
  return createElement(RazorpayAuthContext.Provider, { value: client }, children)
}

/** Returns the Razorpay-capable auth client from context, or null if not wrapped with RazorpayAuthProvider. */
export function useRazorpayAuthClient(): RazorpayAuthClient | null {
  return useContext(RazorpayAuthContext)
}

function requireRazorpayOrApi(client: RazorpayAuthClient): void {
  if (!client.razorpay && !client.api) {
    throw new Error(RAZORPAY_NO_RAZORPAY_OR_API_MESSAGE)
  }
}

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
  requireRazorpayOrApi(client)
  const res = client.razorpay
    ? await client.razorpay.getPlans()
    : await client.api!.get(`${BASE}/get-plans`)
  assertSuccess<PlanSummary[]>(res)
  return res.data
}

/** Fetch subscriptions list (GET /razorpay/subscription/list). Prefers client.razorpay when available. */
async function fetchSubscriptions(
  client: RazorpayAuthClient,
  input?: ListSubscriptionsInput
): Promise<ListSubscriptionsResponse['data']> {
  requireRazorpayOrApi(client)
  const res = client.razorpay
    ? await client.razorpay.listSubscriptions(input)
    : (() => {
      const query: Record<string, string> = {}
      if (input?.referenceId) query.referenceId = input.referenceId
      const path = `${BASE}/subscription/list`
      return Object.keys(query).length > 0
        ? client.api!.get(path, { query })
        : client.api!.get(path)
    })()
  assertSuccess<ListSubscriptionsResponse['data']>(res)
  return res.data
}

/** Create or update subscription (POST /razorpay/subscription/create-or-update). Prefers client.razorpay when available. */
async function createOrUpdateSubscription(
  client: RazorpayAuthClient,
  input: CreateOrUpdateSubscriptionInput
): Promise<CreateOrUpdateSubscriptionResponse['data']> {
  requireRazorpayOrApi(client)
  const res = client.razorpay
    ? await client.razorpay.createOrUpdateSubscription(input)
    : await client.api!.post(`${BASE}/subscription/create-or-update`, {
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
  requireRazorpayOrApi(client)
  const res = client.razorpay
    ? await client.razorpay.cancelSubscription(input)
    : await client.api!.post(`${BASE}/subscription/cancel`, {
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
  requireRazorpayOrApi(client)
  const res = client.razorpay
    ? await client.razorpay.restoreSubscription(input)
    : await client.api!.post(`${BASE}/subscription/restore`, {
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
  requireRazorpayOrApi(client)
  const res = client.razorpay
    ? await client.razorpay.verifyPayment(input)
    : await client.api!.post(`${BASE}/verify-payment`, {
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
 * Requires RazorpayAuthProvider above in the tree.
 */
export function usePlans(options?: UsePlansOptions) {
  const client = useRazorpayAuthClient()
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
 * Requires RazorpayAuthProvider above in the tree.
 */
export function useSubscriptions(
  input?: ListSubscriptionsInput,
  options?: UseSubscriptionsOptions
) {
  const client = useRazorpayAuthClient()
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
 * Create or update a subscription. With embed: true returns data for in-page modal (no checkoutUrl);
 * use openRazorpaySubscriptionCheckout with razorpaySubscriptionId. Without embed, returns checkoutUrl for redirect.
 * Invalidates subscriptions list on success.
 * Requires RazorpayAuthProvider above in the tree.
 */
export function useCreateOrUpdateSubscription(
  options?: UseCreateOrUpdateSubscriptionOptions
) {
  const client = useRazorpayAuthClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOrUpdateSubscriptionInput) => {
      if (!client) throw new Error(RAZORPAY_NO_CLIENT_MESSAGE)
      return createOrUpdateSubscription(client, input)
    },
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
 * Requires RazorpayAuthProvider above in the tree.
 */
export function useCancelSubscription(options?: UseCancelSubscriptionOptions) {
  const client = useRazorpayAuthClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CancelSubscriptionInput) => {
      if (!client) throw new Error(RAZORPAY_NO_CLIENT_MESSAGE)
      return cancelSubscription(client, input)
    },
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

// Re-export client types and in-page checkout helpers
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
export {
  loadRazorpayCheckoutScript,
  openRazorpaySubscriptionCheckout,
  type RazorpaySubscriptionCheckoutOptions,
} from './checkout'

/**
 * Restore a subscription that was scheduled to cancel at period end.
 * Invalidates subscriptions list on success.
 * Requires RazorpayAuthProvider above in the tree.
 */
export function useRestoreSubscription(options?: UseRestoreSubscriptionOptions) {
  const client = useRazorpayAuthClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RestoreSubscriptionInput) => {
      if (!client) throw new Error(RAZORPAY_NO_CLIENT_MESSAGE)
      return restoreSubscription(client, input)
    },
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
 * Requires RazorpayAuthProvider above in the tree.
 */
export function useVerifyPayment(options?: UseVerifyPaymentOptions) {
  const client = useRazorpayAuthClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: VerifyPaymentInput) => {
      if (!client) throw new Error(RAZORPAY_NO_CLIENT_MESSAGE)
      return verifyPayment(client, input)
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: razorpayQueryKeys.subscriptions() })
      options?.onSuccess?.(data, variables, onMutateResult, context)
    },
  })
}
