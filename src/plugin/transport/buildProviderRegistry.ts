/**
 * `buildProviderRegistry` — concrete `ProviderRegistry` instance consumed by
 * the UI (`useProviderRegistry`) and the selector tooltip surface.
 *
 * Satisfies REQ-MPS-006, NFR-MPS-003.
 *
 * The registry is a metadata-only projection of the four v1 (provider, mode)
 * adapter slots. It carries `ProviderCapabilities` records, a user-facing
 * label, and the per-provider slash-command palette. It MUST NOT carry any
 * `ChatTransportPort` or secret-bearing material (NFR-MPS-003). The selector
 * owns the adapter table separately via `ProviderRouterDeps.providers`.
 *
 * Lives in the plugin layer because it is wired at plugin startup, but
 * imports only domain types (ADR-008).
 */
import type {
  ProviderEntry,
  ProviderRegistry,
} from '@/domain/chat/ProviderRegistry'
import type { ProviderId } from '@/domain/chat/ProviderSelection'
import type { ProviderCapabilities } from '@/domain/chat/ProviderCapabilities'
import type { SlashCommand } from '@/domain/chat/SlashCommand'

/**
 * Claude v1 capability record. The model list matches the predecessor
 * `claude-cli-chat-sidebar` baseline; SPEC-MPS-001 §2.4 / §2.7 keeps
 * `providerModel.claude` defaulting to `'claude-sonnet-4'`. The
 * `modeDisabledReason` strings are empty until projected by the selector
 * tooltip layer (REQ-MPS-008).
 */
const CLAUDE_CAPABILITIES: ProviderCapabilities = {
  modes: ['api', 'cli'],
  models: [
    { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
    { id: 'claude-opus-4', label: 'Claude Opus 4' },
    { id: 'claude-haiku-4', label: 'Claude Haiku 4' },
  ],
  supportsStreaming: true,
  supportsTools: true,
  supportsThinking: true,
  supportsPlanMode: true,
  supportsAttachments: ['image', 'file'],
  supportsSessionResume: true,
  modeDisabledReason: { api: null, cli: null },
}

/**
 * Cursor v1 capability record. Cursor's HTTP API is gated by the
 * `cursorApiPreview` flag (REQ-MPS-014); the CLI mode is the default surface.
 * Capability flags reflect Cursor's public surface as of WS-3 — WS-4/WS-5
 * may refine these once the real adapters land.
 */
const CURSOR_CAPABILITIES: ProviderCapabilities = {
  modes: ['api', 'cli'],
  models: [
    { id: 'cursor-default', label: 'Cursor (default)' },
  ],
  supportsStreaming: true,
  supportsTools: true,
  supportsThinking: false,
  supportsPlanMode: false,
  supportsAttachments: ['file'],
  supportsSessionResume: false,
  modeDisabledReason: { api: null, cli: null },
}

const EMPTY_SLASH_COMMANDS: ReadonlyArray<SlashCommand> = Object.freeze([])

/**
 * Build a fresh `ProviderRegistry` containing the two v1 providers. Pure;
 * no I/O. Memoisation, if desired, lives at the caller (`main.ts` keeps a
 * lazy singleton).
 */
export function buildProviderRegistry(): ProviderRegistry {
  const entries: ReadonlyArray<ProviderEntry> = [
    {
      id: 'claude',
      label: 'Claude',
      capabilities: CLAUDE_CAPABILITIES,
      slashCommands: () => EMPTY_SLASH_COMMANDS,
    },
    {
      id: 'cursor',
      label: 'Cursor',
      capabilities: CURSOR_CAPABILITIES,
      slashCommands: () => EMPTY_SLASH_COMMANDS,
    },
  ]
  const byId = new Map<ProviderId, ProviderEntry>()
  for (const entry of entries) byId.set(entry.id, entry)
  return {
    listProviders: () => entries,
    getProvider: (id) => byId.get(id),
    getCapabilities: (id) => byId.get(id)?.capabilities,
  }
}
