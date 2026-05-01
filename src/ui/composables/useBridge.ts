import { inject } from 'vue'
import { BRIDGE_KEY } from '@/infrastructure/bridge/BridgeKey'
import type { IBridge } from '@/infrastructure/bridge/IBridge'

export function useBridge(): IBridge {
  const bridge = inject(BRIDGE_KEY)
  if (!bridge) {
    throw new Error(
      'IBridge was not provided. Call app.provide(BRIDGE_KEY, bridge) before mounting the app.',
    )
  }
  return bridge
}
