import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import type Razorpay from 'razorpay'
import {
  handleRazorpayError,
  subscribeSchema,
  type RazorpaySubscription,
  type RazorpayUserRecord,
} from '../lib'

/**
 * Creates a new subscription for the authenticated user.
 *
 * @param razorpay - The Razorpay instance initialized with API credentials
 * @param plans - Array of valid plan IDs from Razorpay dashboard configuration
 * @returns A Better Auth endpoint handler
 *
 * @remarks
 * This endpoint:
 * - Requires user authentication via session
 * - Validates the plan ID against configured plans
 * - Prevents duplicate active subscriptions
 * - Creates subscription via Razorpay API
 * - Stores subscription record in database
 * - Updates user record with subscription information
 *
 * @example
 * Request body:
 * ```json
 * {
 *   "plan_id": "plan_1234567890",
 *   "total_count": 12,
 *   "quantity": 1,
 *   "customer_notify": true
 * }
 * ```
 */
export const subscribe = (razorpay: Razorpay, plans: string[]) =>
  createAuthEndpoint(
    '/razorpay/subscribe',
    { method: 'POST', use: [sessionMiddleware] },
    async (_ctx) => {
      try {
        // Validate input using Zod schema
        const validatedInput = subscribeSchema.parse(_ctx.body)

        // Check if plan ID exists in configured plans array
        if (!plans.includes(validatedInput.plan_id)) {
          return {
            success: false,
            error: {
              code: 'PLAN_NOT_FOUND',
              description: 'Plan not found in configured plans',
            },
          }
        }

        // Get user ID from session
        const userId = _ctx.context.session?.user?.id

        if (!userId) {
          return {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              description: 'User not authenticated',
            },
          }
        }

        // Check if user already has an active subscription
        const user = (await _ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: userId }],
        })) as RazorpayUserRecord | null

        if (!user) {
          return {
            success: false,
            error: {
              code: 'USER_NOT_FOUND',
              description: 'User not found',
            },
          }
        }

        const existingSubscriptionId = user.subscriptionId
        const existingSubscriptionStatus = user.subscriptionStatus

        // Prevent creating new subscription if user already has an active subscription
        if (existingSubscriptionId) {
          // Check if the existing subscription is still active (not cancelled)
          const activeStatuses = ['active', 'authenticated', 'paused', 'created']
          if (existingSubscriptionStatus && activeStatuses.includes(existingSubscriptionStatus)) {
            return {
              success: false,
              error: {
                code: 'SUBSCRIPTION_ALREADY_EXISTS',
                description:
                  'You already have an active subscription. Please cancel or pause your current subscription before creating a new one.',
              },
            }
          }
        }

        // Create subscription via Razorpay API
        const subscriptionData = {
          plan_id: validatedInput.plan_id,
          total_count: validatedInput.total_count,
          quantity: validatedInput.quantity,
          customer_notify: validatedInput.customer_notify,
          ...(validatedInput.start_at && { start_at: validatedInput.start_at }),
          ...(validatedInput.expire_by && { expire_by: validatedInput.expire_by }),
          ...(validatedInput.addons &&
            validatedInput.addons.length > 0 && { addons: validatedInput.addons }),
          ...(validatedInput.offer_id && { offer_id: validatedInput.offer_id }),
          ...(validatedInput.notes && { notes: validatedInput.notes }),
        }

        const subscription = (await razorpay.subscriptions.create(
          subscriptionData
        )) as RazorpaySubscription

        // Store subscription in database
        await _ctx.context.adapter.create({
          model: 'razorpaySubscription',
          data: {
            userId,
            subscriptionId: subscription.id,
            planId: validatedInput.plan_id,
            status: subscription.status,
          },
        })

        // Update user table with subscription info
        await _ctx.context.adapter.update({
          model: 'user',
          where: [{ field: 'id', value: userId }],
          update: {
            data: {
              subscriptionStatus: subscription.status,
              subscriptionId: subscription.id,
              subscriptionPlanId: validatedInput.plan_id,
              subscriptionCurrentPeriodEnd: subscription.current_end
                ? new Date(subscription.current_end * 1000)
                : null,
              cancelAtPeriodEnd: false, // Initialize as not cancelling
              lastPaymentDate: new Date(), // Set initial payment date
              nextBillingDate: subscription.current_end
                ? new Date(subscription.current_end * 1000)
                : null,
            },
          },
        })

        return {
          success: true,
          data: {
            id: subscription.id,
            entity: subscription.entity,
            plan_id: subscription.plan_id,
            status: subscription.status,
            current_start: subscription.current_start,
            current_end: subscription.current_end,
            ended_at: subscription.ended_at,
            quantity: subscription.quantity,
            notes: subscription.notes,
            charge_at: subscription.charge_at,
            start_at: subscription.start_at,
            end_at: subscription.end_at,
            auth_attempts: subscription.auth_attempts,
            total_count: subscription.total_count,
            paid_count: subscription.paid_count,
            customer_notify: subscription.customer_notify,
            created_at: subscription.created_at,
            expire_by: subscription.expire_by,
            short_url: subscription.short_url,
            has_scheduled_changes: subscription.has_scheduled_changes,
            change_scheduled_at: subscription.change_scheduled_at,
            source: subscription.source,
            offer_id: subscription.offer_id,
            remaining_count: subscription.remaining_count,
          },
        }
      } catch (error) {
        return handleRazorpayError(error)
      }
    }
  )
