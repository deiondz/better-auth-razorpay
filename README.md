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
- ✅ **TanStack Query**: Works with TanStack Query; use our optional [pre-built hooks](#tanstack-query-hooks) or build your own hooks around the auth client's Razorpay namespace (`authClient.razorpay.*`).

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

Add the Razorpay client plugin so your auth client gets a Razorpay namespace. The plugin adds `authClient.razorpay.*` methods (e.g. `getPlans()`, `verifyPayment()`). Better Auth does not expose a generic `api` on the auth client—plugin routes are exposed as namespaces (e.g. `authClient.razorpay`). Use these so requests use the correct paths and avoid 404s.
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
  trialOnSignUp?: { days: number; planName?: string } // Optional: When set with createCustomerOnSignUp, creates an app-level trial subscription at sign-up. Omit for no sign-up trial.
  onCustomerCreate?: (args) => Promise<void>
  getCustomerCreateParams?: (args) => Promise<{ params?: Record<string, unknown> }>
  subscription?: SubscriptionOptions // Optional: { enabled, plans, callbacks, authorizeReference, ... }
  onEvent?: (event) => Promise<void>
  onWebhookEvent?: (payload, context) => Promise<void> // Optional: Custom webhook callback
}
```

### Optional: Trial on sign-up

When you want new users to get a **free trial** without adding a payment method first (e.g. 14 days, then they must subscribe):

- Set **both** `createCustomerOnSignUp: true` and `trialOnSignUp: { days: 14, planName: 'Trial' }` (or any `days` and display `planName`).
- On sign-up, the plugin creates a Razorpay customer and **one local subscription** with `status: 'trialing'`, `trialStart` / `trialEnd`, and no `razorpaySubscriptionId` (no Razorpay subscription until they subscribe).
- **Subscription list** returns this record; your app can show "Free trial — ends &lt;trialEnd&gt;" and gate features when `trialEnd < now`.
- The user can **subscribe anytime** via create-or-update (choose a plan, get checkout URL); the same record is updated to a paid subscription (plan, `razorpaySubscriptionId`, status from Razorpay).

**Configurable:** Omit `trialOnSignUp` for products that do not want sign-up trials (e.g. checkout-first or plan-based trial only). If `trialOnSignUp` is not set, behavior is unchanged.

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
  trialOnSignUp: { days: 14, planName: 'Trial' }, // optional: app-level trial at sign-up
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
- Primary key: **`id`** (generated by the adapter/database when not provided; the plugin does not pass `id` on create, so the adapter uses its `generateId` or the DB’s default, e.g. UUID or MongoDB `_id`). MongoDB adapters should map `id` ↔ `_id` per the [create-a-db-adapter](https://better-auth.com/docs/guides/create-a-db-adapter) guide.
- Fields: `id`, `plan`, `planId`, `referenceId`, `razorpayCustomerId`, `razorpaySubscriptionId`, `status`, `trialStart`, `trialEnd`, `periodStart`, `periodEnd`, `cancelAtPeriodEnd`, `seats`, `groupId`, `createdAt`, `updatedAt`
- `status` values: `created`, `active`, `pending`, `halted`, `cancelled`, `completed`, `expired`, `trialing`

### Database Adapters

The plugin works with all Better Auth database adapters:

- **MongoDB**: `mongodbAdapter()`
- **Prisma**: `prismaAdapter()`
- **Drizzle**: `drizzleAdapter()`
- **Direct connections**: PostgreSQL, MySQL, SQLite

**Important:** Better Auth uses adapter model names, NOT underlying table names. If your Prisma model is `User` mapping to table `users`, use the model name in configuration.

### Primary key and MongoDB

Following [Better Auth’s adapter guide](https://better-auth.com/docs/guides/create-a-db-adapter): the plugin always uses the field name **`id`** for the subscription primary key. The subscription **id is generated by the adapter/database** (the plugin does not pass `id` on create and does not use `forceAllowId`), so the adapter uses its `generateId` or the DB’s default (e.g. PostgreSQL `gen_random_uuid()`, MongoDB `_id`).

- **SQL / Prisma / Drizzle:** The adapter or DB generates the id; no extra config.
- **MongoDB:** Better Auth recommends mapping `id` ↔ `_id` so that:
  - On **input** (create/update), `id` is stored as `_id`.
  - On **output** (findOne/findMany), `_id` is returned as `id`.

  The official `mongodbAdapter` from `better-auth/adapters/mongodb` applies this mapping for all models (including plugin models). If you use a custom MongoDB adapter, configure it with the same mapping (e.g. `mapKeysTransformInput: { id: "_id" }` and `mapKeysTransformOutput: { _id: "id" }` per the [create-a-db-adapter](https://better-auth.com/docs/guides/create-a-db-adapter) guide) so subscription create/update/webhook work correctly.

## API Endpoints

All endpoints are prefixed with `/api/auth/razorpay/` (or your configured `basePath`).

### Subscription flow

| Action | Method | Endpoint | Description |
|--------|--------|----------|-------------|
| Create or update | `POST` | `subscription/create-or-update` | Start a subscription or update. With `embed: true` returns data for in-page modal (no redirect); otherwise returns `checkoutUrl`. Body: `plan` (plan **name** or Razorpay plan ID `plan_*`), `annual?`, `seats?`, `subscriptionId?`, `successUrl?`, `disableRedirect?`, `embed?`. |
| Cancel | `POST` | `subscription/cancel` | Cancel by local subscription ID. Body: `subscriptionId`, `immediately?`. |
| Restore | `POST` | `subscription/restore` | Restore a subscription scheduled to cancel. Body: `subscriptionId`. |
| List | `GET` | `subscription/list` | List active/trialing subscriptions. Query: `referenceId?` (default: current user). |
| Get plans | `GET` | `get-plans` | Return configured plans with price details (name, monthlyPlanId, annualPlanId, limits, freeTrial, monthly/annual amount, currency, period from Razorpay). |
| Webhook | `POST` | `webhook` | Razorpay webhook URL; configure in Razorpay Dashboard. |

### 1. Get Plans

Retrieve all configured subscription plans (from plugin config; no Razorpay API call).

**Endpoint:** `GET /api/auth/razorpay/get-plans`

Each plan in the response includes optional **price details** (`monthly`, `annual`) when available from Razorpay: `amount` (smallest currency unit, e.g. paise/cents), `currency`, `period` (e.g. monthly, yearly), and `interval`. Omitted if the plan fetch fails or the variant is not configured.

**Authentication:** Not required (public endpoint)

**Response:**

```typescript
{
  success: true,
  data: Array<{ name: string; monthlyPlanId: string; annualPlanId?: string; limits?: Record<string, number>; freeTrial?: { days: number }; monthly?: { amount: number; currency: string; period: string; interval?: number }; annual?: { amount: number; currency: string; period: string; interval?: number } }>
}
```

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

// Prefer: use authClient.razorpay (requires razorpayClientPlugin() in createAuthClient)
const result = await authClient.razorpay.getPlans()
if (result.success) {
  const plans = result.data
  // plans: PlanSummary[]
}

// Or using fetch directly
const response = await fetch('/api/auth/razorpay/get-plans')
const { data } = await response.json()
```

---

### 2. Create or update subscription

Create a new subscription or update an existing one for the authenticated user.

**Endpoint:** `POST /api/auth/razorpay/subscription/create-or-update`

**Authentication:** Required (uses `sessionMiddleware`)

**Request Body:**

```typescript
{
  plan: string                       // Required: Plan name (e.g. 'Starter') or Razorpay plan ID (plan_*)
  annual?: boolean                   // Optional: Use annual plan (default: false)
  seats?: number                     // Optional: Seat count (default: 1)
  subscriptionId?: string           // Optional: Existing subscription ID for updates
  successUrl?: string                // Optional: Redirect URL after checkout
  disableRedirect?: boolean          // Optional: Disable redirect
  embed?: boolean                   // Optional: When true, in-page modal (no redirect); use openRazorpaySubscriptionCheckout with razorpaySubscriptionId
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    checkoutUrl?: string | null      // Present when not embed; use for redirect
    subscriptionId: string
    razorpaySubscriptionId: string   // Use with embed + openRazorpaySubscriptionCheckout
  }
}
```

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

// Prefer: use authClient.razorpay (requires razorpayClientPlugin() in createAuthClient)
const result = await authClient.razorpay.createOrUpdateSubscription({
  plan: 'Starter',
  annual: false,
  seats: 1,
})

if (result.success) {
  if (result.data.checkoutUrl) {
    window.location.href = result.data.checkoutUrl
  }
  // Or with embed: true use result.data.razorpaySubscriptionId with openRazorpaySubscriptionCheckout
}
```

**Error Codes:**
- `PLAN_NOT_FOUND` - Plan ID not in configured plans
- `SUBSCRIPTION_ALREADY_EXISTS` - User already has an active subscription
- `UNAUTHORIZED` - User not authenticated
- `USER_NOT_FOUND` - User record not found

---

### 3. List subscriptions

List active/trialing subscriptions for the authenticated user (or by optional referenceId).

**Endpoint:** `GET /api/auth/razorpay/subscription/list`

**Authentication:** Required (uses `sessionMiddleware`)

**Query:** `referenceId?` (optional; default: current user)

**Response:**

```typescript
{
  success: true,
  data: SubscriptionRecord[]  // Array of subscription records
}
```

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

// Prefer: use authClient.razorpay (requires razorpayClientPlugin() in createAuthClient)
const result = await authClient.razorpay.listSubscriptions()
if (result.success && result.data.length) {
  const subscription = result.data[0]
  console.log('Subscription status:', subscription.status)
  console.log('Plan:', subscription.plan)
  console.log('Cancel at period end:', subscription.cancelAtPeriodEnd)
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
    message: string,
    payment_id: string,
    subscription_id: string,
    amount: number,    // Paisa (e.g. 29900 = ₹299.00)
    currency?: string // e.g. INR, USD
  }
}
```

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

// After Razorpay checkout success callback — use authClient.razorpay.verifyPayment
const handlePaymentSuccess = async (razorpayResponse: {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}) => {
  const result = await authClient.razorpay.verifyPayment(razorpayResponse)
  if (result.success) {
    console.log('Payment verified:', result.data.message)
    // result.data.amount (paisa), result.data.currency, etc.
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

**Client Usage:** The client plugin does not expose a dedicated pause method. Use `fetch` to call the endpoint if your server implements it:

```typescript
const response = await fetch('/api/auth/razorpay/pause-subscription', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ subscription_id: 'sub_1234567890' }),
})
const result = await response.json()
if (result.success) {
  console.log('Subscription paused:', result.data.status)
}
```

**Error Codes:**
- `UNAUTHORIZED` - User not authenticated or subscription doesn't belong to user
- `SUBSCRIPTION_NOT_FOUND` - Subscription not found

---

### 6. Restore subscription

Restore a subscription that was scheduled to cancel, or resume a paused Razorpay subscription.

**Endpoint:** `POST /api/auth/razorpay/subscription/restore`

**Authentication:** Required (uses `sessionMiddleware`)

**Request Body:**

```typescript
{
  subscriptionId: string  // Required: Local subscription ID
}
```

**Response:**

```typescript
{
  success: true,
  data: { id: string; status: string }
}
```

**Client Usage:** Restore a subscription that was scheduled to cancel. Use **`authClient.razorpay.restoreSubscription`** (body uses local subscription ID):

```typescript
import { authClient } from '@/lib/auth-client'

const result = await authClient.razorpay.restoreSubscription({
  subscriptionId: 'local_sub_id_or_razorpay_sub_id',
})
if (result.success) {
  console.log('Subscription restored:', result.data.status)
}
```

**Error Codes:**
- `UNAUTHORIZED` - User not authenticated or subscription doesn't belong to user
- `SUBSCRIPTION_NOT_FOUND` - Subscription not found
- `INVALID_STATUS` - Subscription is not paused

---

### 7. Cancel Subscription

Cancel a subscription at the end of the current billing period.

**Endpoint:** `POST /api/auth/razorpay/subscription/cancel`

**Authentication:** Required (uses `sessionMiddleware`)

**Request Body:**

```typescript
{
  subscriptionId: string   // Required: Local subscription ID (or Razorpay subscription ID)
  immediately?: boolean    // Optional: Cancel now vs at period end (default: false)
}
```

**Response:**

```typescript
{
  success: true,
  data: { id: string; status: string; plan_id: string; current_end?: number; ended_at?: number | null }
}
```

**Note:** By default this cancels at period end. Set `immediately: true` to cancel now.

**Client Usage:**

```typescript
import { authClient } from '@/lib/auth-client'

const result = await authClient.razorpay.cancelSubscription({
  subscriptionId: 'local_sub_id_or_razorpay_sub_id',
  immediately: false,
})
if (result.success) {
  console.log('Subscription will cancel at period end:', result.data.status)
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
- `subscription.completed` - Subscription completed (all cycles done)
- `subscription.paused` - Subscription paused
- `subscription.resumed` - Subscription resumed
- `subscription.pending` - Subscription pending
- `subscription.halted` - Subscription halted
- `subscription.expired` - Subscription expired
- `subscription.updated` - Subscription updated (plan/quantity/period changed)

**Response:**

```typescript
{
  success: boolean
  message?: string
}
```

## Client Usage

### Auth client: use the Razorpay namespace

The auth client from `createAuthClient()` is a single client. When you add `razorpayClientPlugin()` to `createAuthClient({ plugins: [...] })`, that same auth client gets a **`razorpay` namespace** with methods like `getPlans()`, `verifyPayment()`, etc. **Call `authClient.razorpay.*`** so requests hit the plugin's routes (avoids 404s):

```typescript
import { authClient } from '@/lib/auth-client'

// GET plans
const plansRes = await authClient.razorpay.getPlans()
if (plansRes.success) console.log(plansRes.data)

// List subscriptions
const listRes = await authClient.razorpay.listSubscriptions({ referenceId: 'optional' })

// Create or update subscription
// With embed: true — in-page modal (no redirect); use openRazorpaySubscriptionCheckout with razorpaySubscriptionId
// Without embed — returns checkoutUrl for redirect
const result = await authClient.razorpay.createOrUpdateSubscription({
  plan: 'Starter',
  annual: false,
  seats: 1,
  embed: true, // keep user on your page; checkout opens as modal
})
if (result.success && result.data.razorpaySubscriptionId) {
  const { openRazorpaySubscriptionCheckout } = await import('@deiondz/better-auth-razorpay/hooks')
  await openRazorpaySubscriptionCheckout({
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    subscriptionId: result.data.razorpaySubscriptionId,
    handler: async (res) => {
      await authClient.razorpay.verifyPayment({
        razorpay_payment_id: res.razorpay_payment_id,
        razorpay_subscription_id: res.razorpay_subscription_id,
        razorpay_signature: res.razorpay_signature,
      })
    },
  })
}
// Or redirect: if (result.success && result.data.checkoutUrl) window.location.href = result.data.checkoutUrl

// Cancel, restore, verify payment
await authClient.razorpay.cancelSubscription({ subscriptionId: 'sub_xxx', immediately: false })
await authClient.razorpay.restoreSubscription({ subscriptionId: 'sub_xxx' })
await authClient.razorpay.verifyPayment({
  razorpay_payment_id: 'pay_xxx',
  razorpay_subscription_id: 'sub_xxx',
  razorpay_signature: '...',
})
```

### Terminology

Better Auth's `createAuthClient()` does **not** add a generic `api.get` / `api.post` to the auth client type. Plugin endpoints are exposed as **namespaces** on that same client (e.g. `authClient.razorpay`). For Razorpay, use **`authClient.razorpay.verifyPayment()`**, **`authClient.razorpay.getPlans()`**, etc. If you use a custom client that implements its own `api.get`/`api.post`, calling those with Razorpay paths can lead to 404s—prefer adding the client plugin and using `authClient.razorpay.*`.

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

The plugin works with **TanStack Query**. We provide optional pre-built hooks that receive the **auth client** from React context. Wrap your app once with **`<RazorpayAuthProvider client={authClient}>`** (the same auth client from `createAuthClient()`) and use **`usePlans()`**, **`useSubscriptions()`**, etc. with no client argument. The hooks call **`authClient.razorpay.*`** when the client has the Razorpay namespace. You can also call `authClient.razorpay.getPlans()`, `authClient.razorpay.createOrUpdateSubscription(...)`, etc. directly, or build your own hooks around those methods.

To use our pre-built hooks, install peer dependencies:

```bash
npm install @tanstack/react-query react
# or yarn / pnpm / bun
```

Import from `@deiondz/better-auth-razorpay/hooks` and wrap your app with **`RazorpayAuthProvider`** so hooks receive the auth client from context:

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
  useVerifyPayment,
  openRazorpaySubscriptionCheckout,
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
  const verifyPayment = useVerifyPayment()
  const cancel = useCancelSubscription()
  const restore = useRestoreSubscription()

  const handleSubscribe = () => {
    createOrUpdate.mutate(
      { plan: 'Starter', annual: false, embed: true }, // in-page modal, no redirect
      {
        onSuccess: async (data) => {
          if (data.checkoutUrl) {
            window.location.href = data.checkoutUrl // redirect flow
            return
          }
          // In-page: open Razorpay modal on your site
          await openRazorpaySubscriptionCheckout({
            key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
            subscriptionId: data.razorpaySubscriptionId,
            handler: (res) => {
              verifyPayment.mutate({
                razorpay_payment_id: res.razorpay_payment_id,
                razorpay_subscription_id: res.razorpay_subscription_id,
                razorpay_signature: res.razorpay_signature,
              })
            },
          })
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
| `useCreateOrUpdateSubscription(options?)` | `useMutation` | Creates or updates subscription; with `embed: true` returns data for in-page modal (use `openRazorpaySubscriptionCheckout`); otherwise returns `checkoutUrl`. Invalidates subscriptions list on success. Requires `RazorpayAuthProvider`. |
| `useVerifyPayment(options?)` | `useMutation` | Verifies payment after Razorpay checkout success (in-page or redirect). Invalidates subscriptions list on success. Requires `RazorpayAuthProvider`. |
| `useCancelSubscription(options?)` | `useMutation` | Cancels by local subscription ID; optional `immediately`. Invalidates subscriptions list on success. Requires `RazorpayAuthProvider`. |
| `useRestoreSubscription(options?)` | `useMutation` | Restores a subscription scheduled to cancel. Invalidates subscriptions list on success. Requires `RazorpayAuthProvider`. |

**Query keys** (for manual invalidation or prefetching):

```ts
import { razorpayQueryKeys } from '@deiondz/better-auth-razorpay/hooks'

razorpayQueryKeys.plans()           // ['razorpay', 'plans']
razorpayQueryKeys.subscriptions()   // ['razorpay', 'subscriptions', 'me']
razorpayQueryKeys.subscriptions('user-id')  // ['razorpay', 'subscriptions', 'user-id']
```

### In-page checkout (no redirect)

To keep users on your site instead of redirecting to Razorpay’s hosted page:

1. Call `createOrUpdateSubscription` with **`embed: true`**. The API will not return `checkoutUrl`; it will return `razorpaySubscriptionId`.
2. Use **`openRazorpaySubscriptionCheckout`** from `@deiondz/better-auth-razorpay/hooks` with your Razorpay key ID and the returned `razorpaySubscriptionId`. This loads Razorpay Checkout.js and opens the payment form as a **modal on your page**.
3. In the `handler` callback, call **`verifyPayment`** with `razorpay_payment_id`, `razorpay_subscription_id`, and `razorpay_signature` to verify and persist the payment.

You can optionally call **`loadRazorpayCheckoutScript()`** earlier (e.g. on route load) so the script is ready when the user clicks Subscribe.

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
  const result = await authClient.razorpay.createOrUpdateSubscription({
    plan: 'plan_123',
    annual: false,
  })

  if (!result.success) {
    switch (result.error.code) {
      case 'PLAN_NOT_FOUND':
        toast.error('Plan not available')
        break
      case 'SUBSCRIPTION_ALREADY_EXISTS':
        toast.error('You already have an active subscription')
        break
      default:
        toast.error(result.error.description)
    }
    return
  }

  // Handle success
  if (result.data.checkoutUrl) window.location.href = result.data.checkoutUrl
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
  const plansResult = await authClient.razorpay.getPlans()
  if (!plansResult.success) {
    console.error('Failed to fetch plans')
    return
  }

  const plans = plansResult.data
  const selectedPlan = plans[0]

  // 2. Create subscription
  const subscribeResult = await authClient.razorpay.createOrUpdateSubscription({
    plan: selectedPlan.name,
    annual: false,
    seats: 1,
  })

  if (!subscribeResult.success) {
    console.error('Failed to create subscription:', subscribeResult.error)
    return
  }

  // 3. Redirect to Razorpay checkout (or use embed + openRazorpaySubscriptionCheckout)
  if (subscribeResult.data.checkoutUrl) {
    window.location.href = subscribeResult.data.checkoutUrl
  }

  // 4. After payment, verify payment (in Razorpay success handler)
  // This is handled in the Razorpay checkout callback
}

// Razorpay checkout success handler
function handleRazorpaySuccess(response: {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}) {
  authClient.razorpay.verifyPayment(response).then((result) => {
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

// Get plans — use authClient.razorpay.getPlans()
export function usePlans() {
  return useQuery({
    queryKey: ['razorpay', 'plans'],
    queryFn: async () => {
      const result = await authClient.razorpay.getPlans()
      if (!result.success) throw new Error(result.error.description)
      return result.data
    },
  })
}

// List subscriptions — use authClient.razorpay.listSubscriptions()
export function useSubscriptions() {
  return useQuery({
    queryKey: ['razorpay', 'subscriptions'],
    queryFn: async () => {
      const result = await authClient.razorpay.listSubscriptions()
      if (!result.success) throw new Error(result.error.description)
      return result.data
    },
  })
}

// Create or update subscription — use authClient.razorpay.createOrUpdateSubscription()
export function useCreateOrUpdateSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { plan: string; annual?: boolean; seats?: number }) => {
      const result = await authClient.razorpay.createOrUpdateSubscription(input)
      if (!result.success) throw new Error(result.error.description)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['razorpay', 'subscriptions'] })
    },
  })
}

// Cancel subscription — use authClient.razorpay.cancelSubscription()
export function useCancelSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { subscriptionId: string; immediately?: boolean }) => {
      const result = await authClient.razorpay.cancelSubscription(input)
      if (!result.success) throw new Error(result.error.description)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['razorpay', 'subscriptions'] })
    },
  })
}

// Restore subscription — use authClient.razorpay.restoreSubscription()
export function useRestoreSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { subscriptionId: string }) => {
      const result = await authClient.razorpay.restoreSubscription(input)
      if (!result.success) throw new Error(result.error.description)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['razorpay', 'subscriptions'] })
    },
  })
}
```

### React Component Example

```typescript
'use client'

import { usePlans, useSubscriptions, useCreateOrUpdateSubscription, useCancelSubscription } from '@/hooks/use-razorpay'

export function SubscriptionPage() {
  const { data: plans, isLoading: plansLoading } = usePlans()
  const { data: subscriptions, isLoading: subLoading } = useSubscriptions()
  const createOrUpdate = useCreateOrUpdateSubscription()
  const cancel = useCancelSubscription()

  const handleSubscribe = async (planName: string) => {
    try {
      const result = await createOrUpdate.mutateAsync({ plan: planName, annual: false })
      if (result.checkoutUrl) window.location.href = result.checkoutUrl
      // Or use result.razorpaySubscriptionId with openRazorpaySubscriptionCheckout when embed: true
    } catch (error) {
      console.error('Failed to create subscription:', error)
      // Handle error (show toast, etc.)
    }
  }

  const subscription = subscriptions?.[0]

  const handleCancel = async () => {
    if (!subscription) return
    try {
      await cancel.mutateAsync({ subscriptionId: subscription.id })
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
          <p>Plan: {subscription.plan}</p>
          {subscription.cancelAtPeriodEnd && (
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
            <div key={plan.name}>
              <h3>{plan.name}</h3>
              <p>{plan.monthly ? `₹${plan.monthly.amount / 100}/month` : ''}</p>
              <button 
                onClick={() => handleSubscribe(plan.name)}
                disabled={createOrUpdate.isPending}
              >
                {createOrUpdate.isPending ? 'Processing...' : 'Subscribe'}
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
      // Verify payment — use authClient.razorpay.verifyPayment()
      const verifyResult = await authClient.razorpay.verifyPayment(response)
      if (verifyResult.success) {
        window.location.href = '/subscription/success'
      } else {
        console.error('Payment verification failed:', verifyResult.error)
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
- Better Auth's auth client does not expose a generic `api`—plugin methods live on namespaces. Add the **client plugin**: `createAuthClient({ plugins: [razorpayClientPlugin(), ...] })` so the auth client gets the **`razorpay` namespace**.
- Call **`authClient.razorpay.getPlans()`**, **`authClient.razorpay.verifyPayment()`**, **`authClient.razorpay.createOrUpdateSubscription(...)`**, etc. (these are part of the normal auth client under the `razorpay` namespace).
- Wrap your app with **`<RazorpayAuthProvider client={authClient}>`** so hooks receive the same auth client; use **`usePlans()`**, **`useSubscriptions()`**, etc. with no client argument.
- The TanStack hooks call `authClient.razorpay.*` when present, so they work once the client plugin is added.

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

## Scope for improvement

Potential future enhancements (not currently implemented):

- **Plan-level / Razorpay-native trial:** Pass `trial_period` (days) to Razorpay when creating a subscription (from plan `freeTrial.days`), handle `subscription.trialing` webhook if Razorpay adds or documents it, and set `trialStart` / `trialEnd` from Razorpay payload. Today only **app-level trial** (`trialOnSignUp`) is supported: a local trialing subscription at sign-up with no Razorpay subscription until the user chooses a plan.

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

