import type Razorpay from 'razorpay'
import { createAuthEndpoint } from 'better-auth/api'
import {
  handleRazorpayError,
  type PlanPriceDetail,
  type RazorpayPlan,
  type RazorpayPluginOptions,
} from '../lib'

async function resolvePlans(
  plans: RazorpayPlan[] | (() => Promise<RazorpayPlan[]>)
): Promise<RazorpayPlan[]> {
  return typeof plans === 'function' ? plans() : plans
}

/** Razorpay Plan API response (minimal shape used for price details). */
interface RazorpayPlanResponse {
  id: string
  interval?: number
  period?: string
  item?: {
    amount?: number
    currency?: string
    name?: string
    description?: string | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

async function fetchPlanPrice(
  razorpay: Razorpay,
  planId: string
): Promise<PlanPriceDetail | undefined> {
  try {
    const plan = (await razorpay.plans.fetch(planId)) as unknown as RazorpayPlanResponse
    const item = plan?.item
    if (item && typeof item.amount === 'number' && typeof item.currency === 'string') {
      return {
        amount: item.amount,
        currency: item.currency,
        period: typeof plan.period === 'string' ? plan.period : 'monthly',
        interval: typeof plan.interval === 'number' ? plan.interval : undefined,
      }
    }
  } catch {
    // Plan not found or API error: omit price for this variant
  }
  return undefined
}

/**
 * GET /api/auth/razorpay/get-plans
 * Returns the configured subscription plans with name, monthlyPlanId, annualPlanId, limits, freeTrial, and price details (amount, currency, period) from Razorpay.
 */
export const getPlans = (
  razorpay: Razorpay,
  options: Pick<RazorpayPluginOptions, 'subscription'>
) =>
  createAuthEndpoint('/razorpay/get-plans', { method: 'GET' }, async (_ctx) => {
    try {
      const subOpts = options.subscription
      if (!subOpts?.enabled) {
        return { success: true, data: [] }
      }
      const plans = await resolvePlans(subOpts.plans)
      const data = await Promise.all(
        plans.map(async (p) => {
          const [monthly, annual] = await Promise.all([
            fetchPlanPrice(razorpay, p.monthlyPlanId),
            p.annualPlanId ? fetchPlanPrice(razorpay, p.annualPlanId) : Promise.resolve(undefined),
          ])
          return {
            name: p.name,
            monthlyPlanId: p.monthlyPlanId,
            annualPlanId: p.annualPlanId,
            description: p.description,
            limits: p.limits,
            freeTrial: p.freeTrial ? { days: p.freeTrial.days } : undefined,
            monthly,
            annual,
          }
        })
      )
      return { success: true, data }
    } catch (error) {
      return handleRazorpayError(error)
    }
  })
