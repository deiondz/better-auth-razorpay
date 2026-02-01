# Razorpay Plugin for Better Auth

A comprehensive subscription management plugin for Better Auth that integrates with Razorpay for handling recurring payments, subscriptions, and webhooks.

> **📚 Always consult [better-auth.com/docs](https://better-auth.com/docs) for the latest Better Auth API and best practices.**

## Credits

This plugin is inspired by and aligned with the design of the [better-auth-razorpay](https://github.com/iamjasonkendrick/better-auth-razorpay) community plugin. Credit and thanks go to the original author **[Jason Kendrick](https://github.com/iamjasonkendrick)** ([@iamjasonkendrick](https://github.com/iamjasonkendrick)) for the subscription flow, callback API, and feature set that this implementation follows.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [API Endpoints](#api-endpoints)
- [Client Usage](#client-usage)
- [TanStack Query Hooks](#tanstack-query-hooks)
- [Webhook Setup](#webhook-setup)
- [TypeScript Types](#typescript-types)
- [Error Handling](#error-handling)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Credits](#credits)

## Overview

The Razorpay plugin provides a subscription management solution aligned with the [community plugin design](https://github.com/iamjasonkendrick/better-auth-razorpay):

- ✅ **Subscription flow**: Create-or-update (returns checkout URL), cancel (at period end or immediately), restore, list active/trialing subscriptions
- ✅ **Named plans**: Plans with `name`, `monthlyPlanId`, optional `annualPlanId`, `limits`, and `freeTrial`
- ✅ **Customer on sign-up**: Optional Razorpay customer creation when a user signs up, with `onCustomerCreate` and `getCustomerCreateParams`
- ✅ **Webhook handling**: Subscription events (activated, cancelled, expired, etc.) with optional `onSubscriptionActivated`, `onSubscriptionCancel`, `onSubscriptionUpdate`, and global `onEvent`
- ✅ **Authorization**: `authorizeReference` for list/create actions; `requireEmailVerification` for subscriptions
- ✅ **Type safety**: Full TypeScript support with `SubscriptionRecord`, `RazorpayPlan`, and plugin options
- ✅ **TanStack Query**: Works with TanStack Query; use our optional [pre-built hooks](#tanstack-query-hooks) or build your own hooks around `authClient.api` (GET/POST to the Razorpay endpoints).

## Installation

### Prerequisites

- Better Auth configured in your project
- Razorpay account with API credentials
- Plans created in Razorpay dashboard

### Setup

1. **Install the Package**

```bash
npm install @deiondz/better-auth-razorpay
# or
yarn add @deiondz/better-auth-razorpay
# or
pnpm add @deiondz/better-auth-razorpay
# or
bun add @deiondz/better-auth-razorpay
```

The package includes `razorpay` and `zod` as dependencies.

2. **Configure the Plugin**

You can either pass an existing Razorpay instance (`razorpayClient`) or let the plugin create it from credentials (`razorpayKeyId` + `razorpayKeySecret`).

**Option A: Pass credentials (plugin creates the Razorpay instance)**

```typescript
// src/lib/auth.ts (or your auth configuration file)
import { betterAuth } from 'better-auth'
import { razorpayPlugin } from '@deiondz/better-auth-razorpay'

export const auth = betterAuth({
  // ... your Better Auth configuration
  database: mongodbAdapter(await connect()), // or your adapter
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  
  plugins: [
    razorpayPlugin({
      razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
      razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET!, // also enables verify-payment endpoint when set
      razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
      createCustomerOnSignUp: true, // optional
      subscription: {
        enabled: true,
        plans: [
          {
            name: 'Starter',
            monthlyPlanId: 'plan_xxxxxxxxxxxx',
            annualPlanId: 'plan_yyyyyyyyyyyy', // optional
            limits: { features: 5 },
            freeTrial: { days: 7 }, // optional
          },
        ],
        onSubscriptionActivated: async ({ subscription, plan }) => {
          console.log(`Subscription ${subscription.id} activated for plan ${plan.name}`)
        },
      },
      onWebhookEvent: async (payload, context) => {
        const { event, subscription, payment } = payload
        if (event === 'subscription.charged' && payment) {
          // Send confirmation email, etc.
        }
      },
    }),
  ],
})
```

**Option B: Pass an existing Razorpay client**

```typescript
// src/lib/auth.ts
import Razorpay from 'razorpay'
import { betterAuth } from 'better-auth'
import { razorpayPlugin } from '@deiondz/better-auth-razorpay'

const razorpayClient = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export const auth = betterAuth({
  // ... your Better Auth configuration
  database: mongodbAdapter(await connect()),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  
  plugins: [
    razorpayPlugin({
      razorpayClient,
      razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
      razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET, // optional: enables verify-payment endpoint
      createCustomerOnSignUp: true, // optional
      subscription: {
        enabled: true,
        plans: [
          {
            name: 'Starter',
            monthlyPlanId: 'plan_xxxxxxxxxxxx',
            annualPlanId: 'plan_yyyyyyyyyyyy', // optional
            limits: { features: 5 },
            freeTrial: { days: 7 }, // optional
          },
        ],
        onSubscriptionActivated: async ({ subscription, plan }) => {
          console.log(`Subscription ${subscription.id} activated for plan ${plan.name}`)
        },
      },
      onWebhookEvent: async (payload, context) => {
        const { event, subscription, payment } = payload
        if (event === 'subscription.charged' && payment) {
          // Send confirmation email, etc.
        }
      },
    }),
  ],
})
```

3. **Add Client Plugin (required to avoid 404s)**

Add the Razorpay client plugin so requests use the correct paths. **Without it, calls like `authClient.api.get('/razorpay/get-plans')` can hit wrong URLs (e.g. `POST /api/auth/api/get` 404).** The plugin exposes `authClient.razorpay.*` methods that use the plugin’s route map.

```typescript
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react'
import { razorpayClientPlugin } from '@deiondz/better-auth-razorpay/client'
import type { auth } from './auth'

export const authClient = createAuthClient<typeof auth>({
  baseURL: process.env.PUBLIC_URL, // Optional if same domain
  plugins: [
    razorpayClientPlugin(),
    // ... other client plugins
  ],
})
```

4. **Environment Variables**

Add to your `.env` file:

```env
# Better Auth (if not using env vars)
BETTER_AUTH_SECRET=your_32_char_minimum_secret
BETTER_AUTH_URL=https://yourdomain.com

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret_key
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
# Pass RAZORPAY_KEY_SECRET as razorpayKeySecret in plugin options to enable the verify-payment endpoint (same as client key, not webhook secret).
```

5. **Run Database Migration**

After adding the plugin, run the Better Auth CLI to apply schema changes:

```bash
npx @better-auth/cli@latest migrate
# or for Prisma/Drizzle
npx @better-auth/cli@latest generate
```

**Important:** Re-run the CLI after adding or changing plugins to update your database schema.

## Configuration

### Plugin Options

```typescript
interface RazorpayPluginOptions {
  razorpayClient?: Razorpay       // Optional: Initialized Razorpay instance; omit when using razorpayKeyId + razorpayKeySecret
  razorpayKeyId?: string          // Optional: Razorpay API key ID; required when razorpayClient is not provided (plugin creates the instance)
  razorpayKeySecret?: string     // Optional: Razorpay API key secret; required when razorpayClient is not provided; when set, enables POST /razorpay/verify-payment
  razorpayWebhookSecret?: string // Optional: Webhook secret for signature verification
  createCustomerOnSignUp?: boolean // Optional: Create Razorpay customer on user sign-up (default: false)
  onCustomerCreate?: (args) => Promise<void>
  getCustomerCreateParams?: (args) => Promise<{ params?: Record<string, unknown> }>
  subscription?: SubscriptionOptions // Optional: { enabled, plans, callbacks, authorizeReference, ... }
  onEvent?: (event) => Promise<void>
  onWebhookEvent?: (payload, context) => Promise<void> // Optional: Custom webhook callback
}
```

### Callback functions

The plugin supports the same callback hooks as the [community plugin](https://github.com/iamjasonkendrick/better-auth-razorpay). You can use them for emails, analytics, external systems, or custom logic.

| Callback | When it runs |
|----------|----------------|
| **`onCustomerCreate`** | After a Razorpay customer is created (when `createCustomerOnSignUp` is true and the user signs up). Receives `{ user, razorpayCustomer }`. |
| **`getCustomerCreateParams`** | Before creating a Razorpay customer on sign-up. Return `{ params }` (e.g. `notes`) to add custom data to the customer. |
| **`getSubscriptionCreateParams`** | Before creating a Razorpay subscription (create-or-update). Return `{ params }` (e.g. `notes`) to add custom data to the subscription. Receives `{ user, session, plan, subscription }`. |
| **`authorizeReference`** | Before create-or-update and before listing subscriptions for a `referenceId` other than the current user. Return `true` to allow. Receives `{ user, referenceId, action }`. |
| **`onSubscriptionCreated`** | After a new subscription is created (create-or-update). Receives `{ razorpaySubscription, subscription, plan }`. |
| **`onSubscriptionActivated`** | When the webhook receives `subscription.activated`. Receives `{ event, razorpaySubscription, subscription, plan }`. |
| **`onSubscriptionUpdate`** | When the webhook receives any other subscription event (e.g. `charged`, `paused`, `resumed`, `pending`, `halted`). Receives `{ event, subscription }`. |
| **`onSubscriptionCancel`** | When the webhook receives `subscription.cancelled` or `subscription.expired`. Receives `{ event, razorpaySubscription, subscription }`. |
| **`onEvent`** | After every processed webhook event. Receives the full event payload `{ event, ...payload }`. |
| **`onWebhookEvent`** | Legacy: after webhook processing, with payload and user context. Receives `(payload, context)` where `context` has `userId` and `user`. |
| **`freeTrial.onTrialStart`** | Optional, on a plan’s `freeTrial`. Call when you consider a subscription’s trial to have started (e.g. from your own logic or webhook handling). Receives `(subscription)`. |
| **`freeTrial.onTrialEnd`** | Optional, on a plan’s `freeTrial`. Call when you consider a subscription’s trial to have ended. Receives `{ subscription }`. |

Example: using callbacks in your config:

```typescript
razorpayPlugin({
  razorpayClient,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET, // optional: enables verify-payment endpoint
  createCustomerOnSignUp: true,
  onCustomerCreate: async ({ user, razorpayCustomer }) => {
    console.log(`Razorpay customer created for user ${user.id}: ${razorpayCustomer.id}`)
  },
  getCustomerCreateParams: async ({ user, session }) => ({
    params: { notes: { internalUserId: user.id } },
  }),
  subscription: {
    enabled: true,
    plans: [
      {
        name: 'Starter',
        monthlyPlanId: 'plan_xxx',
        freeTrial: {
          days: 7,
          onTrialStart: async (subscription) => console.log('Trial started', subscription.id),
          onTrialEnd: async ({ subscription }) => console.log('Trial ended', subscription.id),
        },
      },
    ],
    getSubscriptionCreateParams: async ({ user, plan, subscription }) => ({
      params: { notes: { planName: plan.name } },
    }),
    onSubscriptionCreated: async ({ razorpaySubscription, subscription, plan }) => {
      console.log(`Subscription ${subscription.id} created for plan ${plan.name}`)
    },
    onSubscriptionActivated: async ({ event, subscription, plan }) => {
      console.log(`Subscription ${subscription.id} activated`)
    },
    onSubscriptionUpdate: async ({ event, subscription }) => {
      console.log(`Subscription ${subscription.id} updated: ${event}`)
    },
    onSubscriptionCancel: async ({ event, subscription }) => {
      console.log(`Subscription ${subscription.id} cancelled/expired: ${event}`)
    },
    authorizeReference: async ({ user, referenceId, action }) => user.id === referenceId,
  },
  onEvent: async (event) => console.log('Razorpay event:', event.event),
  onWebhookEvent: async (payload, context) => {
    // Custom logic: emails, analytics, etc.
  },
})
```

### User Fields (Plug-and-Play)

The plugin extends the Better Auth user schema with:

- **user**: `razorpayCustomerId` (optional) — set when `createCustomerOnSignUp` is true or when a customer is created for subscriptions.

You do **not** need to add it manually to `user.additionalFields` unless you prefer to define it yourself.

## Database Setup

### Automatic Schema Creation

The plugin automatically creates the following database models via Better Auth's schema system:

**`user`** (extended)
- `razorpayCustomerId` (string, optional) — Razorpay customer ID when customer creation is enabled.

**`subscription`**
- `id`, `plan`, `referenceId`, `razorpayCustomerId`, `razorpaySubscriptionId`, `status`, `trialStart`, `trialEnd`, `periodStart`, `periodEnd`, `cancelAtPeriodEnd`, `seats`, `groupId`, `createdAt`, `updatedAt`
- `status` values: `created`, `active`, `pending`, `halted`, `cancelled`, `completed`, `expired`, `trialing`

### Database Adapters

The plugin works with all Better Auth database adapters:

- **MongoDB**: `mongodbAdapter()`
- **Prisma**: `prismaAdapter()`
- **Drizzle**: `drizzleAdapter()`
- **Direct connections**: PostgreSQL, MySQL, SQLite

**Important:** Better Auth uses adapter model names, NOT underlying table names. If your Prisma model is `User` mapping to table `users`, use the model name in configuration.

## API Endpoints

All endpoints are prefixed with `/api/auth/razorpay/` (or your configured `basePath`).

### Subscription flow

| Action | Method | Endpoint | Description |
|--------|--------|----------|-------------|
| Create or update | `POST` | `subscription/create-or-update` | Start a subscription or update; returns `checkoutUrl` for Razorpay payment page. Body: `plan` (plan **name** or Razorpay plan ID `plan_*`), `annual?`, `seats?`, `subscriptionId?`, `successUrl?`, `disableRedirect?`. |
| Cancel | `POST` | `subscription/cancel` | Cancel by local subscription ID. Body: `subscriptionId`, `immediately?`. |
| Restore | `POST` | `subscription/restore` | Restore a subscription scheduled to cancel. Body: `subscriptionId`. |
| List | `GET` | `subscription/list` | List active/trialing subscriptions. Query: `referenceId?` (default: current user). |
| Get plans | `GET` | `get-plans` | Return configured plans (name, monthlyPlanId, annualPlanId, limits, freeTrial). |
| Webhook | `POST` | `webhook` | Razorpay webhook URL; configure in Razorpay Dashboard. |

### 1. Get Plans

Retrieve all configured subscription plans (from plugin config; no Razorpay API call).

**Endpoint:** `GET /api/auth/razorpay/get-plans`

**Authentication:** Not required (public endpoint)

**Response:**

```typescript
{
  success: true,
  data: Array<{ name: string; monthlyPlanId: string; annualPlanId?: string; limits?: Record<string, number>; freeTrial?: { days: number } }>
}
```

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

// Using Better Auth client
const response = await authClient.api.get('/razorpay/get-plans')
const { data } = response

// Or using fetch directly
const response = await fetch('/api/auth/razorpay/get-plans')
const { data } = await response.json()
```

---

### 2. Subscribe

Create a new subscription for the authenticated user.

**Endpoint:** `POST /api/auth/razorpay/subscribe`

**Authentication:** Required (uses `sessionMiddleware`)

**Request Body:**

```typescript
{
  plan_id: string                    // Required: Plan ID from Razorpay
  total_count?: number               // Optional: Total billing cycles (default: 12)
  quantity?: number                  // Optional: Quantity (default: 1)
  start_at?: number                  // Optional: Start timestamp (Unix)
  expire_by?: number                 // Optional: Expiry timestamp (Unix)
  customer_notify?: boolean           // Optional: Send notification (default: true)
  addons?: Array<{                   // Optional: Addons
    item: {
      name: string
      amount: number
      currency: string
    }
  }>
  offer_id?: string                  // Optional: Offer ID
  notes?: Record<string, string>     // Optional: Custom notes
}
```

**Response:**

```typescript
{
  success: true,
  data: RazorpaySubscription
}
```

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

// Using Better Auth client
const response = await authClient.api.post('/razorpay/subscribe', {
  body: {
    plan_id: 'plan_1234567890',
    total_count: 12,
    quantity: 1,
  },
})

if (response.success) {
  // Redirect to Razorpay checkout
  window.location.href = response.data.short_url
}
```

**Error Codes:**
- `PLAN_NOT_FOUND` - Plan ID not in configured plans
- `SUBSCRIPTION_ALREADY_EXISTS` - User already has an active subscription
- `UNAUTHORIZED` - User not authenticated
- `USER_NOT_FOUND` - User record not found

---

### 3. Get Subscription

Retrieve current subscription details for the authenticated user.

**Endpoint:** `GET /api/auth/razorpay/get-subscription`

**Authentication:** Required (uses `sessionMiddleware`)

**Response:**

```typescript
{
  success: true,
  data: RazorpaySubscription | null  // null if no subscription
}
```

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

// Using Better Auth client
const response = await authClient.api.get('/razorpay/get-subscription')

if (response.success && response.data) {
  console.log('Subscription status:', response.data.status)
  console.log('Plan ID:', response.data.plan_id)
  console.log('Cancel at period end:', response.data.cancel_at_period_end)
}
```

**Error Codes:**
- `UNAUTHORIZED` - User not authenticated
- `USER_NOT_FOUND` - User record not found
- `SUBSCRIPTION_FETCH_FAILED` - Failed to fetch from Razorpay API

---

### 4. Verify Payment

Verify payment signature after Razorpay checkout completion. This endpoint is **only registered when `razorpayKeySecret`** is set in plugin options. Use the same API key secret as your Razorpay client (not the webhook secret).

**Endpoint:** `POST /api/auth/razorpay/verify-payment`

**Authentication:** Required (uses `sessionMiddleware`)

**Request Body:**

```typescript
{
  razorpay_payment_id: string        // Required: Payment ID from Razorpay
  razorpay_subscription_id: string  // Required: Subscription ID from Razorpay
  razorpay_signature: string         // Required: Payment signature
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    message: 'Payment verified successfully',
    payment_id: string,
    subscription_id: string
  }
}
```

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

// After Razorpay checkout success callback
const handlePaymentSuccess = async (razorpayResponse: {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}) => {
  const response = await authClient.api.post('/razorpay/verify-payment', {
    body: razorpayResponse,
  })

  if (response.success) {
    console.log('Payment verified:', response.data.message)
    // Redirect to success page
  }
}
```

**Error Codes:**
- `SIGNATURE_VERIFICATION_FAILED` - Invalid payment signature
- `UNAUTHORIZED` - User not authenticated
- `SUBSCRIPTION_NOT_FOUND` - Subscription record not found
- `FORBIDDEN` - Subscription does not belong to authenticated user

---

### 5. Pause Subscription

Pause an active subscription.

**Endpoint:** `POST /api/auth/razorpay/pause-subscription`

**Authentication:** Required (uses `sessionMiddleware`)

**Request Body:**

```typescript
{
  subscription_id: string  // Required: Subscription ID
}
```

**Response:**

```typescript
{
  success: true,
  data: RazorpaySubscription
}
```

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

const response = await authClient.api.post('/razorpay/pause-subscription', {
  body: {
    subscription_id: 'sub_1234567890',
  },
})

if (response.success) {
  console.log('Subscription paused:', response.data.status)
}
```

**Error Codes:**
- `UNAUTHORIZED` - User not authenticated or subscription doesn't belong to user
- `SUBSCRIPTION_NOT_FOUND` - Subscription not found

---

### 6. Resume Subscription

Resume a paused subscription.

**Endpoint:** `POST /api/auth/razorpay/resume-subscription`

**Authentication:** Required (uses `sessionMiddleware`)

**Request Body:**

```typescript
{
  subscription_id: string  // Required: Subscription ID
}
```

**Response:**

```typescript
{
  success: true,
  data: RazorpaySubscription
}
```

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

const response = await authClient.api.post('/razorpay/resume-subscription', {
  body: {
    subscription_id: 'sub_1234567890',
  },
})

if (response.success) {
  console.log('Subscription resumed:', response.data.status)
}
```

**Error Codes:**
- `UNAUTHORIZED` - User not authenticated or subscription doesn't belong to user
- `SUBSCRIPTION_NOT_FOUND` - Subscription not found
- `INVALID_STATUS` - Subscription is not paused

---

### 7. Cancel Subscription

Cancel a subscription at the end of the current billing period.

**Endpoint:** `POST /api/auth/razorpay/cancel-subscription`

**Authentication:** Required (uses `sessionMiddleware`)

**Request Body:**

```typescript
{
  subscription_id: string  // Required: Subscription ID
}
```

**Response:**

```typescript
{
  success: true,
  data: RazorpaySubscription
}
```

**Note:** This cancels the subscription at period end, not immediately. The subscription remains active until the current billing period ends.

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

const response = await authClient.api.post('/razorpay/cancel-subscription', {
  body: {
    subscription_id: 'sub_1234567890',
  },
})

if (response.success) {
  console.log('Subscription will cancel at period end')
}
```

**Error Codes:**
- `UNAUTHORIZED` - User not authenticated or subscription doesn't belong to user
- `SUBSCRIPTION_NOT_FOUND` - Subscription not found

---

### 8. Webhook

Handle Razorpay webhook events (automatically called by Razorpay).

**Endpoint:** `POST /api/auth/razorpay/webhook`

**Authentication:** Not required (webhook endpoint)

**Headers:**
- `x-razorpay-signature` - Webhook signature (required)

**Supported Events:**
- `subscription.authenticated` - Subscription authenticated
- `subscription.activated` - Subscription activated
- `subscription.charged` - Payment charged
- `subscription.cancelled` - Subscription cancelled
- `subscription.paused` - Subscription paused
- `subscription.resumed` - Subscription resumed
- `subscription.pending` - Subscription pending
- `subscription.halted` - Subscription halted

**Response:**

```typescript
{
  success: boolean
  message?: string
}
```

## Client Usage

### Preferred: authClient.razorpay.* (method-based API)

When you add `razorpayClientPlugin()` to `createAuthClient({ plugins: [...] })`, the client gets `authClient.razorpay` with explicit methods. **Use these so requests hit the correct paths** (avoids 404s like `POST /api/auth/api/get`):

```typescript
import { authClient } from '@/lib/auth-client'

// GET plans
const plansRes = await authClient.razorpay.getPlans()
if (plansRes.success) console.log(plansRes.data)

// List subscriptions
const listRes = await authClient.razorpay.listSubscriptions({ referenceId: 'optional' })

// Create or update subscription (returns checkoutUrl for Razorpay payment page)
// plan: use the plan name (e.g. 'Starter') or the Razorpay plan ID (e.g. 'plan_xxxxxxxxxxxx')
const result = await authClient.razorpay.createOrUpdateSubscription({
  plan: 'Starter',
  annual: false,
  seats: 1,
})
if (result.success) window.location.href = result.data.checkoutUrl

// Cancel, restore, verify payment
await authClient.razorpay.cancelSubscription({ subscriptionId: 'sub_xxx', immediately: false })
await authClient.razorpay.restoreSubscription({ subscriptionId: 'sub_xxx' })
await authClient.razorpay.verifyPayment({
  razorpay_payment_id: 'pay_xxx',
  razorpay_subscription_id: 'sub_xxx',
  razorpay_signature: '...',
})
```

### Fallback: authClient.api (only if client plugin is not used)

If you do not add the client plugin, you can use `authClient.api.get/post` with the Razorpay paths. **This can lead to 404s** (e.g. `POST /api/auth/api/get`) depending on how your auth client resolves paths. Prefer adding the client plugin and using `authClient.razorpay.*` instead.

### Type Safety

Infer types from your auth configuration:

```typescript
import type { auth } from '@/lib/auth'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient<typeof auth>({
  // ... config
})

// Infer session type
type Session = typeof authClient.$Infer.Session
type User = typeof authClient.$Infer.Session.user
```

## TanStack Query Hooks

The plugin works with **TanStack Query**. We provide optional pre-built hooks that get the auth client from React context; wrap your app once with **`<RazorpayAuthProvider client={authClient}>`** and use **`usePlans()`**, **`useSubscriptions()`**, etc. with **no client argument**. When you use `razorpayClientPlugin()`, the hooks call `authClient.razorpay.*` so requests hit the correct paths. If you prefer a different setup, use `authClient.razorpay.getPlans()`, `authClient.razorpay.createOrUpdateSubscription(...)`, etc., or build your own hooks around those methods.

To use our pre-built hooks, install peer dependencies:

```bash
npm install @tanstack/react-query react
# or yarn / pnpm / bun
```

Import from `@deiondz/better-auth-razorpay/hooks` and wrap your app with **`RazorpayAuthProvider`** so hooks can read the client from context:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAuthClient } from 'better-auth/react'
import { razorpayClientPlugin } from '@deiondz/better-auth-razorpay/client'
import {
  RazorpayAuthProvider,
  usePlans,
  useSubscriptions,
  useCreateOrUpdateSubscription,
  useCancelSubscription,
  useRestoreSubscription,
  razorpayQueryKeys,
} from '@deiondz/better-auth-razorpay/hooks'
import type { CreateOrUpdateSubscriptionInput } from '@deiondz/better-auth-razorpay/hooks'

const queryClient = new QueryClient()
// auth from your server config (e.g. import type { auth } from './auth')
const authClient = createAuthClient<typeof auth>({
  plugins: [razorpayClientPlugin()],
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RazorpayAuthProvider client={authClient}>
        <SubscriptionUI />
      </RazorpayAuthProvider>
    </QueryClientProvider>
  )
}

function SubscriptionUI() {
  // Plans (no auth required)
  const { data: plans, isLoading: plansLoading } = usePlans()

  // Current user's subscriptions (requires session)
  const { data: subscriptions, isLoading: subsLoading } = useSubscriptions()

  const createOrUpdate = useCreateOrUpdateSubscription()
  const cancel = useCancelSubscription()
  const restore = useRestoreSubscription()

  const handleSubscribe = () => {
    createOrUpdate.mutate(
      { plan: 'Starter', annual: false },
      {
        onSuccess: (data) => {
          window.location.href = data.checkoutUrl // Redirect to Razorpay
        },
      }
    )
  }

  const handleCancel = (subscriptionId: string) => {
    cancel.mutate({ subscriptionId, immediately: false })
  }

  const handleRestore = (subscriptionId: string) => {
    restore.mutate({ subscriptionId })
  }

  if (plansLoading) return <div>Loading plans...</div>
  return (
    <div>
      {plans?.map((p) => (
        <button key={p.name} onClick={handleSubscribe} disabled={createOrUpdate.isPending}>
          Subscribe to {p.name}
        </button>
      ))}
      {subscriptions?.map((s) => (
        <div key={s.id}>
          {s.plan} – {s.status}
          {s.cancelAtPeriodEnd ? (
            <button onClick={() => handleRestore(s.id)}>Restore</button>
          ) : (
            <button onClick={() => handleCancel(s.id)}>Cancel</button>
          )}
        </div>
      ))}
    </div>
  )
}
```

### Hooks reference

| Hook | Type | Description |
|------|------|-------------|
| `usePlans(options?)` | `useQuery` | Fetches configured plans (GET `/razorpay/get-plans`). Requires `RazorpayAuthProvider` above in the tree. |
| `useSubscriptions(input?, options?)` | `useQuery` | Lists active/trialing subscriptions (GET `/razorpay/subscription/list`). Optional `referenceId` in input or options. Requires `RazorpayAuthProvider`. |
| `useCreateOrUpdateSubscription(options?)` | `useMutation` | Creates or updates subscription; returns `checkoutUrl`. Invalidates subscriptions list on success. Requires `RazorpayAuthProvider`. |
| `useCancelSubscription(options?)` | `useMutation` | Cancels by local subscription ID; optional `immediately`. Invalidates subscriptions list on success. Requires `RazorpayAuthProvider`. |
| `useRestoreSubscription(options?)` | `useMutation` | Restores a subscription scheduled to cancel. Invalidates subscriptions list on success. Requires `RazorpayAuthProvider`. |

**Query keys** (for manual invalidation or prefetching):

```ts
import { razorpayQueryKeys } from '@deiondz/better-auth-razorpay/hooks'

razorpayQueryKeys.plans()           // ['razorpay', 'plans']
razorpayQueryKeys.subscriptions()   // ['razorpay', 'subscriptions', 'me']
razorpayQueryKeys.subscriptions('user-id')  // ['razorpay', 'subscriptions', 'user-id']
```

## Webhook Setup

### 1. Configure Webhook in Razorpay Dashboard

1. Go to Razorpay Dashboard → Settings → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/auth/razorpay/webhook`
3. Select events to subscribe:
   - `subscription.authenticated`
   - `subscription.activated`
   - `subscription.charged`
   - `subscription.cancelled`
   - `subscription.paused`
   - `subscription.resumed`
   - `subscription.pending`
   - `subscription.halted`
4. Copy the webhook secret

### 2. Configure Webhook Secret

Add the webhook secret to your environment variables:

```env
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

### 3. Custom Webhook Handler (Optional)

You can provide a custom callback function to handle webhook events:

```typescript
razorpayPlugin({
  // ... other options
  onWebhookEvent: async (payload, context) => {
    const { event, subscription, payment } = payload
    const { userId, user } = context

    switch (event) {
      case 'subscription.charged':
        // Send payment confirmation email
        await sendEmail(user.email, 'Payment Successful', {
          amount: payment?.amount,
          subscriptionId: subscription.id,
        })
        break

      case 'subscription.cancelled':
        // Send cancellation email
        await sendEmail(user.email, 'Subscription Cancelled')
        break

      case 'subscription.activated':
        // Update external systems
        await updateCRM(userId, { subscriptionActive: true })
        break

      // Handle other events...
    }
  },
})
```

**Important:** Webhook callback errors are handled silently and don't break core webhook processing. The callback is for custom business logic only.

## TypeScript Types

### Import Types

```typescript
import type {
  RazorpaySubscription,
  RazorpaySubscriptionRecord,
  RazorpayUserRecord,
  RazorpayApiResponse,
  RazorpaySuccessResponse,
  RazorpayErrorResponse,
  RazorpayPluginOptions,
  OnWebhookEventCallback,
} from '@deiondz/better-auth-razorpay'
```

### Response Types

```typescript
// Success response
interface RazorpaySuccessResponse<T> {
  success: true
  data: T
}

// Error response
interface RazorpayErrorResponse {
  success: false
  error: {
    code: string
    description: string
    [key: string]: unknown  // Additional error metadata (development only)
  }
}

// Union type
type RazorpayApiResponse<T> = RazorpaySuccessResponse<T> | RazorpayErrorResponse
```

### Subscription Type

```typescript
interface RazorpaySubscription {
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
```

## Error Handling

### Error Response Format

All endpoints return errors in a consistent format:

```typescript
{
  success: false,
  error: {
    code: string,        // Error code (e.g., 'UNAUTHORIZED', 'PLAN_NOT_FOUND')
    description: string,  // Human-readable error message
    [key: string]: unknown  // Additional error metadata (development only)
  }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `INVALID_REQUEST` | Validation error (Zod schema validation failed) |
| `UNAUTHORIZED` | User not authenticated or subscription doesn't belong to user |
| `PLAN_NOT_FOUND` | Plan ID not found in configured plans |
| `SUBSCRIPTION_NOT_FOUND` | Subscription record not found |
| `SUBSCRIPTION_ALREADY_EXISTS` | User already has an active subscription |
| `INVALID_STATUS` | Subscription is not in the expected status |
| `SIGNATURE_VERIFICATION_FAILED` | Payment signature verification failed |
| `NETWORK_ERROR` | Network connection failed |
| `TIMEOUT_ERROR` | Request timed out |
| `RAZORPAY_ERROR` | Razorpay API error |
| `UNKNOWN_ERROR` | Unexpected error occurred |

### Error Handling Example

```typescript
import { authClient } from '@/lib/auth-client'

try {
  const response = await authClient.api.post('/razorpay/subscribe', {
    body: { plan_id: 'plan_123' },
  })

  if (!response.success) {
    switch (response.error.code) {
      case 'PLAN_NOT_FOUND':
        toast.error('Plan not available')
        break
      case 'SUBSCRIPTION_ALREADY_EXISTS':
        toast.error('You already have an active subscription')
        break
      default:
        toast.error(response.error.description)
    }
    return
  }

  // Handle success
  window.location.href = response.data.short_url
} catch (error) {
  console.error('Network error:', error)
  toast.error('Network error. Please try again.')
}
```

## Usage Examples

### Complete Subscription Flow

```typescript
import { authClient } from '@/lib/auth-client'

async function handleSubscriptionFlow() {
  // 1. Get available plans
  const plansResponse = await authClient.api.get('/razorpay/get-plans')
  if (!plansResponse.success) {
    console.error('Failed to fetch plans')
    return
  }

  const plans = plansResponse.data
  const selectedPlan = plans[0]

  // 2. Create subscription
  const subscribeResponse = await authClient.api.post('/razorpay/subscribe', {
    body: {
      plan_id: selectedPlan.id,
      total_count: 12,
    },
  })

  if (!subscribeResponse.success) {
    console.error('Failed to create subscription:', subscribeResponse.error)
    return
  }

  // 3. Redirect to Razorpay checkout
  window.location.href = subscribeResponse.data.short_url

  // 4. After payment, verify payment (in Razorpay success handler)
  // This is handled in the Razorpay checkout callback
}

// Razorpay checkout success handler
function handleRazorpaySuccess(response: {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}) {
  authClient.api.post('/razorpay/verify-payment', {
    body: response,
  }).then((result) => {
    if (result.success) {
      // Redirect to success page
      window.location.href = '/subscription/success'
    }
  })
}
```

### React Hook Example with TanStack Query

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '@/lib/auth-client'

// Get plans
export function usePlans() {
  return useQuery({
    queryKey: ['razorpay', 'plans'],
    queryFn: async () => {
      const response = await authClient.api.get('/razorpay/get-plans')
      if (!response.success) throw new Error(response.error.description)
      return response.data
    },
  })
}

// Get subscription
export function useSubscription() {
  return useQuery({
    queryKey: ['razorpay', 'subscription'],
    queryFn: async () => {
      const response = await authClient.api.get('/razorpay/get-subscription')
      if (!response.success) throw new Error(response.error.description)
      return response.data
    },
  })
}

// Subscribe
export function useSubscribe() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (planId: string) => {
      const response = await authClient.api.post('/razorpay/subscribe', {
        body: { plan_id: planId },
      })
      if (!response.success) throw new Error(response.error.description)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['razorpay', 'subscription'] })
    },
  })
}

// Cancel subscription
export function useCancelSubscription() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const response = await authClient.api.post('/razorpay/cancel-subscription', {
        body: { subscription_id: subscriptionId },
      })
      if (!response.success) throw new Error(response.error.description)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['razorpay', 'subscription'] })
    },
  })
}

// Pause subscription
export function usePauseSubscription() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const response = await authClient.api.post('/razorpay/pause-subscription', {
        body: { subscription_id: subscriptionId },
      })
      if (!response.success) throw new Error(response.error.description)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['razorpay', 'subscription'] })
    },
  })
}

// Resume subscription
export function useResumeSubscription() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const response = await authClient.api.post('/razorpay/resume-subscription', {
        body: { subscription_id: subscriptionId },
      })
      if (!response.success) throw new Error(response.error.description)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['razorpay', 'subscription'] })
    },
  })
}
```

### React Component Example

```typescript
'use client'

import { usePlans, useSubscription, useSubscribe, useCancelSubscription } from '@/hooks/use-razorpay'

export function SubscriptionPage() {
  const { data: plans, isLoading: plansLoading } = usePlans()
  const { data: subscription, isLoading: subLoading } = useSubscription()
  const subscribe = useSubscribe()
  const cancel = useCancelSubscription()

  const handleSubscribe = async (planId: string) => {
    try {
      const subscription = await subscribe.mutateAsync(planId)
      // Redirect to Razorpay checkout
      window.location.href = subscription.short_url
    } catch (error) {
      console.error('Failed to create subscription:', error)
      // Handle error (show toast, etc.)
    }
  }

  const handleCancel = async () => {
    if (!subscription) return
    try {
      await cancel.mutateAsync(subscription.id)
      alert('Subscription will be cancelled at period end')
    } catch (error) {
      console.error('Failed to cancel subscription:', error)
    }
  }

  if (plansLoading || subLoading) {
    return <div>Loading...</div>
  }

  return (
    <div>
      {subscription ? (
        <div>
          <h2>Current Subscription</h2>
          <p>Status: {subscription.status}</p>
          <p>Plan: {subscription.plan_id}</p>
          {subscription.cancel_at_period_end && (
            <p className="text-warning">Will cancel at period end</p>
          )}
          <button 
            onClick={handleCancel}
            disabled={cancel.isPending}
          >
            {cancel.isPending ? 'Cancelling...' : 'Cancel Subscription'}
          </button>
        </div>
      ) : (
        <div>
          <h2>Select a Plan</h2>
          {plans?.map((plan) => (
            <div key={plan.id}>
              <h3>{plan.name || plan.id}</h3>
              <p>₹{plan.amount / 100}/month</p>
              <button 
                onClick={() => handleSubscribe(plan.id)}
                disabled={subscribe.isPending}
              >
                {subscribe.isPending ? 'Processing...' : 'Subscribe'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Razorpay Checkout Integration

```typescript
import { loadScript } from '@/lib/razorpay-script' // Your script loader

async function initializeRazorpayCheckout(subscriptionId: string) {
  // Load Razorpay script
  await loadScript('https://checkout.razorpay.com/v1/checkout.js')

  const options = {
    subscription_id: subscriptionId,
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    name: 'Your App Name',
    description: 'Subscription Payment',
    handler: async function (response: {
      razorpay_payment_id: string
      razorpay_subscription_id: string
      razorpay_signature: string
    }) {
      // Verify payment
      const verifyResponse = await authClient.api.post('/razorpay/verify-payment', {
        body: response,
      })

      if (verifyResponse.success) {
        // Redirect to success page
        window.location.href = '/subscription/success'
      } else {
        // Handle error
        console.error('Payment verification failed:', verifyResponse.error)
      }
    },
    prefill: {
      name: user.name,
      email: user.email,
    },
    theme: {
      color: '#3399cc',
    },
  }

  const razorpay = new (window as any).Razorpay(options)
  razorpay.open()
}
```

## Best Practices

### 1. Better Auth Configuration

- **Use environment variables** - Prefer `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` env vars over config
- **Re-run CLI after changes** - Always run `npx @better-auth/cli@latest migrate` after adding/changing plugins
- **Model names vs table names** - Use ORM model names in config, not DB table names
- **Type inference** - Use `typeof auth.$Infer.Session` for type safety

### 2. Plan Management

- **Create plans in Razorpay dashboard** - Plans are managed in Razorpay, not through the API
- **Use plan IDs in configuration** - Add all plan IDs to the `plans` array in plugin options
- **Validate plans client-side** - Always validate plan IDs before allowing users to subscribe

### 3. Security

- **Always verify payment signatures** - Never skip signature verification
- **Use HTTPS** - Always use HTTPS in production
- **Protect webhook secret** - Never expose webhook secret in client-side code
- **Validate user ownership** - The plugin automatically validates subscription ownership
- **Production error messages** - Error messages are automatically sanitized in production

### 4. Error Handling

- **Handle all error codes** - Check for specific error codes and provide user-friendly messages
- **Log errors server-side** - Log detailed errors server-side, show generic messages to users
- **Retry logic** - Implement retry logic for network errors and timeouts
- **Use Better Auth error patterns** - Follow Better Auth's error handling conventions

### 5. Webhook Handling

- **Idempotent operations** - Ensure webhook handlers are idempotent
- **Handle failures gracefully** - Webhook callback errors don't break core functionality
- **Monitor webhook events** - Log webhook events for debugging and analytics
- **Use webhook callback** - Leverage `onWebhookEvent` for custom business logic

### 6. Subscription Lifecycle

- **Check subscription status** - Always check subscription status before allowing actions
- **Handle edge cases** - Account for paused, cancelled, and expired subscriptions
- **Update UI accordingly** - Reflect subscription status changes in your UI
- **Use webhooks for updates** - Rely on webhooks for status updates rather than polling

### 7. Performance

- **Cache plans** - Plans don't change frequently, consider caching
- **Optimize queries** - The plugin already optimizes database queries
- **Use webhooks** - Rely on webhooks for status updates rather than polling
- **TanStack Query** - Use TanStack Query for client-side caching and state management

### 8. TypeScript Best Practices

- **Infer types from auth** - Use `typeof auth.$Infer.Session` for type safety
- **Type client properly** - Use `createAuthClient<typeof auth>()` for full type inference
- **Export types** - Export and reuse types from the plugin

## Troubleshooting

### Common Issues

**1. "POST /api/auth/api/get 404" or Razorpay requests returning 404**
- Add the **client plugin** to your auth client: `createAuthClient({ plugins: [razorpayClientPlugin(), ...] })`
- Use **method-based API** instead of `authClient.api.get/post`: call `authClient.razorpay.getPlans()`, `authClient.razorpay.createOrUpdateSubscription(...)`, etc., so requests use the plugin’s route map and hit the correct paths
- Wrap your app with **`<RazorpayAuthProvider client={authClient}>`** so hooks get the client from context; use **`usePlans()`**, **`useSubscriptions()`**, etc. with no client argument
- The TanStack hooks use `authClient.razorpay` when present, so they work correctly once the client plugin is added

**For maintainers:** See [Razorpay plugin × Better Auth client (problem and solution)](docs/BETTER_AUTH_CLIENT_CONTEXT.md) for the 404/TypeScript root cause and plugin-side fixes.

**2. "Plan not found in configured plans"**
- Ensure the plan ID exists in Razorpay dashboard
- Add the plan ID to the `plans` array in plugin configuration
- Re-run Better Auth CLI after updating plans

**3. "Webhook signature verification failed"**
- Verify webhook secret matches Razorpay dashboard
- Ensure webhook URL is correct: `https://yourdomain.com/api/auth/razorpay/webhook`
- Check that request body is not modified
- Verify `x-razorpay-signature` header is present

**4. "Subscription already exists"**
- User already has an active subscription
- Cancel or pause existing subscription first
- Check subscription status before creating new one

**5. "User not authenticated"**
- Ensure user is logged in via Better Auth
- Check session middleware is properly configured
- Verify `sessionMiddleware` is used in endpoint configuration

**6. "Subscription not found"**
- Subscription may have been deleted
- Check subscription ID is correct
- Verify subscription belongs to the user

**7. Database Schema Issues**
- Run `npx @better-auth/cli@latest migrate` after adding plugin
- For Prisma/Drizzle: Run `npx @better-auth/cli@latest generate`
- Check that user additional fields are properly configured

**8. Type Errors**
- Ensure you're using `createAuthClient<typeof auth>()` for type inference
- Import types from `@deiondz/better-auth-razorpay`
- Check that plugin is properly exported

## Resources

- [Better Auth Documentation](https://better-auth.com/docs)
- [Better Auth Options Reference](https://better-auth.com/docs/reference/options)
- [Better Auth LLMs.txt](https://better-auth.com/llms.txt)
- [Razorpay API Documentation](https://razorpay.com/docs/api/)
- [Razorpay Subscriptions Guide](https://razorpay.com/docs/payments/subscriptions/)

## Support

For issues, questions, or contributions:

1. Check the [Better Auth documentation](https://better-auth.com/docs)
2. Review [Razorpay API documentation](https://razorpay.com/docs/api/)
3. Open an issue on GitHub

## License

This plugin is part of the Better Auth ecosystem and follows the same license as Better Auth.

