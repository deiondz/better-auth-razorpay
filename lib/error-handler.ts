import { z } from 'zod'

/**
 * Helper function to handle Razorpay-related errors and reduce complexity.
 * Handles various error types including validation, network, timeout, and Razorpay API errors.
 */
function handleRazorpayError(error: unknown): {
  success: false
  error: { code: string; description: string }
} {
  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    return {
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        description: error.issues[0]?.message || 'Validation failed',
      },
    }
  }

  // Handle network errors (fetch/axios network failures)
  if (error && typeof error === 'object') {
    // Check for network error indicators
    const errorObj = error as Record<string, unknown>
    if (
      'code' in errorObj &&
      (errorObj.code === 'ECONNREFUSED' ||
        errorObj.code === 'ENOTFOUND' ||
        errorObj.code === 'ETIMEDOUT' ||
        errorObj.code === 'ECONNRESET')
    ) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          description: 'Network connection failed. Please check your internet connection and try again.',
        },
      }
    }

    // Handle timeout errors
    if (
      'name' in errorObj &&
      (errorObj.name === 'TimeoutError' ||
        errorObj.name === 'AbortError' ||
        (typeof errorObj.message === 'string' &&
          errorObj.message.toLowerCase().includes('timeout')))
    ) {
      return {
        success: false,
        error: {
          code: 'TIMEOUT_ERROR',
          description: 'Request timed out. Please try again.',
        },
      }
    }

    // Handle Razorpay error format: { error: { code: string, description: string } }
    if ('error' in errorObj) {
      const razorpayError = errorObj as {
        error?: { code?: string; description?: string; field?: string }
      }
      return {
        success: false,
        error: {
          code: razorpayError.error?.code || 'RAZORPAY_ERROR',
          description:
            razorpayError.error?.description ||
            razorpayError.error?.field
              ? `Razorpay error: ${razorpayError.error.field}`
              : 'Razorpay request failed',
        },
      }
    }

    // Handle standard error objects with message
    if ('message' in errorObj && typeof errorObj.message === 'string') {
      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          description: errorObj.message,
        },
      }
    }
  }

  // Fallback for unknown error types
  return {
    success: false,
    error: {
      code: 'UNKNOWN_ERROR',
      description: 'An unexpected error occurred. Please try again or contact support.',
    },
  }
}

export { handleRazorpayError }