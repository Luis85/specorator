import { inject } from 'vue'
import type { CanvasPort } from '@/domain/ports'
import { CANVAS_PORT } from '@/infrastructure/bridge/ports'

export function useCanvasPort(): CanvasPort {
  const port = inject(CANVAS_PORT)
  if (!port) {
    throw new Error(
      'CanvasPort was not provided. Call app.provide(CANVAS_PORT, port) before mounting the app.',
    )
  }
  return port
}
