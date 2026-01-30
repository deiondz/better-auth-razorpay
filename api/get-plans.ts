import { createAuthEndpoint } from 'better-auth/api'
import { handleRazorpayError, type RazorpayPlan, type RazorpayPluginOptions } from '../lib'

async function resolvePlans(
  plans: RazorpayPlan[] | (() => Promise<RazorpayPlan[]>)
): Promise<RazorpayPlan[]> {
  return typeof plans === 'function' ? plans() : plans
}

/**
 * GET /api/auth/razorpay/get-plans
 * Returns the configured subscription plans (name, monthlyPlanId, annualPlanId, limits, freeTrial).
 * Does not call Razorpay API.
 */
export const getPlans = (options: Pick<RazorpayPluginOptions, 'subscription'>) =>
  createAuthEndpoint('/razorpay/get-plans', { method: 'GET' }, async (_ctx) => {
    try {
      const subOpts = options.subscription
      if (!subOpts?.enabled) {
        return { success: true, data: [] }
      }
      const plans = await resolvePlans(subOpts.plans)
      return {
        success: true,
        data: plans.map((p) => ({
          name: p.name,
          monthlyPlanId: p.monthlyPlanId,
          annualPlanId: p.annualPlanId,
          limits: p.limits,
          freeTrial: p.freeTrial ? { days: p.freeTrial.days } : undefined,
        })),
      }
    } catch (error) {
      return handleRazorpayError(error)
    }
  })
