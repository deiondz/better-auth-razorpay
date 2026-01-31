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

    // Razorpay SDK (axios) may put API error in response.data; normalize to same shape
    const axiosData = (errorObj as { response?: { data?: { error?: unknown } } }).response?.data
    const directError = 'error' in errorObj ? (errorObj as { error: unknown }).error : null
    const razorpayPayload = axiosData?.error ?? directError

    // Handle Razorpay error format: { error: { code, description?, field?, reason?, step? } }
    if (razorpayPayload && typeof razorpayPayload === 'object') {
      const rp = razorpayPayload as {
        code?: string
        description?: string
        field?: string
        reason?: string
        step?: string
      }
      const code = rp?.code && String(rp.code).trim() ? rp.code : 'RAZORPAY_ERROR'
      const desc = rp?.description && String(rp.description).trim()
      const field = rp?.field != null && String(rp.field).trim() ? rp.field : null
      const reason = rp?.reason && String(rp.reason).trim() ? rp.reason : null
      const step = rp?.step && String(rp.step).trim() ? rp.step : null
      const description =
        desc ||
        (field ? `Razorpay error: ${field}` : null) ||
        (reason ? `Razorpay: ${reason}` : null) ||
        (step ? `Razorpay error at step: ${step}` : null) ||
        'Razorpay request failed'
      return {
        success: false,
        error: { code, description },
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