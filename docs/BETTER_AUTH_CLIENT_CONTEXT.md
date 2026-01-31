# Razorpay plugin × Better Auth client: problem and solution

## Problem

When apps use the Razorpay plugin with Better Auth's `createAuthClient()`, two things can go wrong.

### 1. Wrong request path → 404 (`POST /api/auth/api/get`)

- The plugin docs show calling `authClient.api.get('/razorpay/get-plans')` and `authClient.api.post('/razorpay/verify-payment', { body })`.
- Better Auth's client is a **dynamic path proxy**: the request path is built from the **property chain**, not from the first argument.
- So:
  - `authClient.api.get(...)` → path = `api` + `get` → **`/api/get`**
  - `authClient.api.post(...)` → path = **`/api/post`**
- The server receives `POST /api/auth/api/get` (or `/api/post`) and returns **404**, because the real routes are `/api/auth/razorpay/get-plans`, `/api/auth/razorpay/verify-payment`, etc.

So: **relying on `api.get(path)` / `api.post(path)` with a path argument does not work** with the default Better Auth client; the path argument is ignored and the chain is used instead.

### 2. TypeScript: "Property 'api' is missing" (`RazorpayAuthClient`)

- The plugin's hooks expect a **`RazorpayAuthClient`** that has `api: { get, post }` (and optionally `razorpay`).
- The type returned by `createAuthClient()` does **not** declare an `api` property in its public interface (the proxy has it at runtime, but it's not part of the inferred type).
- So when the app does `useCreateOrUpdateSubscription(authClient)` (and similar), TypeScript says the argument is not assignable to `RazorpayAuthClient` because **`api` is missing** in the type.

So: **the real client satisfies the plugin at runtime** (and has `razorpay` from the plugin's `getActions`), but **the type does not**, which forces apps to use casts or workarounds.

---

## Root cause (short)

- **404:** Better Auth's client proxy builds the URL path from the property chain (`api` → `get` / `post`), not from the first argument to `api.get(path)` / `api.post(path)`.
- **TypeScript:** Better Auth's client type doesn't expose `api` (and plugin actions like `razorpay` may not be part of the generic client type in a way that matches `RazorpayAuthClient`).

---

## Solution (plugin-side)

### A. Don't rely on `api.get(path)` / `api.post(path)` for paths

- Use **`getActions`** in the client plugin to expose **`authClient.razorpay`** with methods that call **`$fetch(path, options)`** directly (e.g. `getPlans()`, `createOrUpdateSubscription()`, `verifyPayment()`, etc.).
- In the hooks, **prefer `client.razorpay`** when present; only fall back to `client.api.get(path)` / `client.api.post(path)` when you explicitly support a custom client that provides `api` with the path as first argument.
- Document that **`razorpayClientPlugin()` must be included in `createAuthClient({ plugins: [..., razorpayClientPlugin()] })`** so that `authClient.razorpay` exists and requests always hit the correct paths. This avoids the 404 entirely for normal usage.

### B. Fix the type so the Better Auth client is accepted without casts

- **Relax `RazorpayAuthClient`** so that it matches how the client is actually used:
  - **Primary:** `razorpay?: RazorpayClientActions` (set by the plugin's `getActions`).
  - **Fallback:** `api?: { get(...), post(...) }` (optional), for custom clients that implement path-based `api.get`/`api.post`.
- In the hooks, at runtime:
  - If `client.razorpay` exists → use it (correct paths, no 404).
  - Else if `client.api` exists → use `api.get`/`api.post` (for custom clients that pass path as first argument).
  - Else → throw a clear error: e.g. "Razorpay hooks require a client created with `razorpayClientPlugin()` in `createAuthClient({ plugins: [...] })`."
- After this change, the object returned by `createAuthClient({ plugins: [..., razorpayClientPlugin()] })` is assignable to `RazorpayAuthClient` (it has `razorpay`), and apps no longer need to cast `authClient as RazorpayAuthClient`.

### C. Hooks without passing the client

- Provide **`RazorpayAuthProvider`** and **`useRazorpayAuthClient()`** so the app wraps the tree once with `<RazorpayAuthProvider client={authClient}>`.
- Hooks (**`usePlans()`**, **`useSubscriptions()`**, etc.) take **no client argument** and get the client from context via **`useRazorpayAuthClient()`**.
- When no provider or client is present: queries are disabled (`enabled: !!client`); mutations throw a clear error.

---

## Solution (app-side, if the plugin isn't updated yet)

- **TypeScript:** Cast the client when passing to hooks:  
  `useCreateOrUpdateSubscription(authClient as RazorpayAuthClient)` (and same for other Razorpay hooks), or export a single `razorpayAuthClient = authClient as RazorpayAuthClient` and use that everywhere for Razorpay.
- **404:** Either ensure `razorpayClientPlugin()` is in `createAuthClient` plugins so `authClient.razorpay` exists and the hooks use it, or (if the app must use `api.get`/`api.post`) wrap the client in a small proxy that overrides `api.get`/`api.post` to call `$fetch(path, options)` so the path argument is actually used.

---

## Summary table

| Issue | Cause | Plugin-side fix | App-side fix (if needed) |
|-------|--------|------------------|---------------------------|
| 404 `/api/auth/api/get` | Proxy builds path from chain, not from `api.get(path)` argument | Use `getActions` → `authClient.razorpay` and prefer it in hooks; document that the plugin must be in `createAuthClient` plugins | Add plugin to `createAuthClient`; or wrap client so `api.get`/`api.post` use path |
| TS "Property 'api' is missing" | Better Auth client type doesn't declare `api` | Make `RazorpayAuthClient` require only `razorpay?` and optional `api?`; add runtime check in hooks | Cast: `authClient as RazorpayAuthClient` or use a typed `razorpayAuthClient` |
| Hooks take client as arg | N/A | Add `RazorpayAuthProvider` + `useRazorpayAuthClient()`; hooks get client from context, no client arg | Wrap app with `<RazorpayAuthProvider client={authClient}>` and use `usePlans()`, etc. with no argument |
