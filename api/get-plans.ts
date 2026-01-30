import { createAuthEndpoint } from 'better-auth/api'
import type Razorpay from 'razorpay'
import { getPlansSchema, handleRazorpayError } from '../lib'

/**
 * Retrieves plan details from Razorpay for configured plan IDs.
 *
 * @param razorpay - The Razorpay instance initialized with API credentials
 * @param planIds - Array of plan IDs configured in the plugin options
 * @returns A Better Auth endpoint handler
 *
 * @remarks
 * This endpoint:
 * - Fetches plan details from Razorpay API
 * - Silently skips plans that fail to fetch (filters them out)
 * - Returns all successfully fetched plans
 * - Does not require authentication (public endpoint)
 *
 * @example
 * Response (success):
 * ```json
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "plan_1234567890",
 *       "name": "Premium Plan",
 *       "amount": 1000,
 *       ...
 *     }
 *   ]
 * }
 * ```
 */
export const getPlans = (razorpay: Razorpay, planIds: string[]) =>
  createAuthEndpoint('/razorpay/get-plans', { method: 'GET' }, async (_ctx) => {
    try {
      // GET requests don't have a body, so validation is optional
      // Schema allows undefined for GET requests
      getPlansSchema.parse(_ctx.body)

      // Fetch plan details from Razorpay API using configured plan IDs
      const plans = await Promise.all(
        planIds.map(async (planId) => {
          try {
            const plan = await razorpay.plans.fetch(planId)
            return plan
          } catch {
            // Silently skip failed plan fetches - they will be filtered out
            // Individual plan fetch failures shouldn't break the entire request
            return null
          }
        })
      )

      // Filter out any null values from failed fetches
      const validPlans = plans.filter((plan) => plan !== null)

      return { success: true, data: validPlans }
    } catch (error) {
      return handleRazorpayError(error)
    }
  })
