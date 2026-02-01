/**
 * In-page Razorpay subscription checkout (modal on your site).
 * Load the script once, then open the checkout with subscription_id from create-or-update (embed: true).
 */

const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance
  }
}

/** Razorpay Checkout.js options for subscription (in-page modal). */
export interface RazorpaySubscriptionCheckoutOptions {
  /** Razorpay key ID (e.g. from NEXT_PUBLIC_RAZORPAY_KEY_ID). */
  key: string
  /** Razorpay subscription ID (from create-or-update response when embed: true). */
  subscriptionId: string
  /** Called when payment succeeds; verify signature with verify-payment API. */
  handler: (response: RazorpayCheckoutSuccessPayload) => void
  /** Prefill name, email, contact. */
  prefill?: { name?: string; email?: string; contact?: string }
  name?: string
  description?: string
  image?: string
  theme?: { color?: string }
  /** Modal lifecycle (e.g. ondismiss when user closes without paying). */
  modal?: { ondismiss?: () => void }
}

/** Success payload from Razorpay Checkout (subscription). */
export type RazorpayCheckoutSuccessPayload = {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

interface RazorpayCheckoutOptions {
  key: string
  subscription_id: string
  handler: (response: RazorpayCheckoutSuccessPayload) => void
  prefill?: { name?: string; email?: string; contact?: string }
  name?: string
  description?: string
  image?: string
  theme?: { color?: string }
  modal?: { ondismiss?: () => void }
}

interface RazorpayCheckoutInstance {
  open: () => void
}

let scriptLoadPromise: Promise<void> | null = null

/**
 * Load Razorpay Checkout.js script once. Call before openRazorpaySubscriptionCheckout
 * or pass it as the first step in your flow.
 */
export function loadRazorpayCheckoutScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout runs only in the browser'))
  }
  if (window.Razorpay) {
    return Promise.resolve()
  }
  if (scriptLoadPromise) {
    return scriptLoadPromise
  }
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CHECKOUT_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptLoadPromise = null
      reject(new Error('Failed to load Razorpay Checkout script'))
    }
    document.head.appendChild(script)
  })
  return scriptLoadPromise
}

/**
 * Open Razorpay subscription checkout as a modal on the current page.
 * Loads the Checkout script if needed. Use with create-or-update subscription with embed: true;
 * pass the returned razorpaySubscriptionId.
 */
export async function openRazorpaySubscriptionCheckout(
  options: RazorpaySubscriptionCheckoutOptions
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Razorpay Checkout runs only in the browser')
  }
  if (!window.Razorpay) {
    await loadRazorpayCheckoutScript()
  }
  const Razorpay = window.Razorpay!
  const rzp = new Razorpay({
    key: options.key,
    subscription_id: options.subscriptionId,
    handler: options.handler,
    prefill: options.prefill,
    name: options.name,
    description: options.description,
    image: options.image,
    theme: options.theme,
    modal: options.modal,
  })
  rzp.open()
}
