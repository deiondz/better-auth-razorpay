import type { BetterAuthClientPlugin } from 'better-auth/client'
import type { razorpayPlugin } from './index'

export const razorpayClientPlugin = () =>
  ({
    id: 'razorpay-plugin',
    $InferServerPlugin: {} as ReturnType<typeof razorpayPlugin>,
  }) satisfies BetterAuthClientPlugin
