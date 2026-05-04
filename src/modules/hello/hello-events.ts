import type {} from '@/domain/shared/event-bus'

declare module '@/domain/shared/event-bus' {
  interface EventMap {
    'hello:initialized': { moduleId: string }
  }
}
