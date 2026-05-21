/**
 * Application-layer re-export of `selectTransport` (SPEC-ASM-001 §6.1, T-ASM-005 DoD).
 *
 * The implementation lives in `src/plugin/transport/TransportSelector.ts`
 * because it is wired by the Obsidian plugin entry point. This barrel keeps
 * the public import path stable for UI / test code that wants an
 * application-layer import.
 *
 * Satisfies REQ-ASM-002, REQ-ASM-003, REQ-MPS-007, REQ-MPS-008.
 */
export {
  selectTransport,
  type ProviderRouterDeps,
  type TransportResolution,
} from '@/plugin/transport/TransportSelector'
