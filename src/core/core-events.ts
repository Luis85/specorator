// Declaration merge: adds core:* channels to the shared EventMap.
// Error objects are acceptable here — these events are in-process diagnostic
// signals, never serialised. Consumers: log error.message only, not the full
// Error object, to avoid leaking stack traces.
declare module '@/domain/shared/event-bus' {
  interface EventMap {
    'core:module-degraded':  { moduleId: string; error: Error }
    'core:init-complete':    { degradedCount: number }
    'core:destroy-complete': { leakCount: number }
  }
}

export {}
