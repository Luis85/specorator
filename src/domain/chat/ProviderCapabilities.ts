/**
 * `ProviderCapabilities` — declarative metadata about what a provider can do.
 *
 * Satisfies REQ-MPS-006. The capability record drives UI affordances (model
 * pickers, plan-mode toggle, attachment buttons) and disables modes that
 * cannot run on the current host. The shape is exhaustive over the v1
 * feature surface; future capabilities are additive readonly fields.
 *
 * Per SPEC-MPS-001 §2.4 every field is readonly to prevent accidental
 * mutation by the registry consumers. `modeDisabledReason` carries a
 * per-mode user-facing reason string (`null` when the mode is available).
 *
 * Domain layer (ADR-008): no `obsidian` / `child_process` imports.
 */
import type { ProviderMode } from './ProviderSelection'

export interface ProviderCapabilities {
  /** Modes the provider supports in principle (ignoring runtime resolution). */
  readonly modes: ReadonlyArray<ProviderMode>
  /** Model IDs the user can pick in the provider chooser. */
  readonly models: ReadonlyArray<{ readonly id: string; readonly label: string }>
  /** Whether the provider streams output (SSE / async iterable). */
  readonly supportsStreaming: boolean
  /** Whether the provider exposes a Tool / function-calling surface. */
  readonly supportsTools: boolean
  /** Whether the provider emits explicit `thinking` content. */
  readonly supportsThinking: boolean
  /** Whether the provider supports plan-mode (REQ-MPS-027). */
  readonly supportsPlanMode: boolean
  /** Attachment kinds the provider can accept (image, file, …). */
  readonly supportsAttachments: ReadonlyArray<'image' | 'file'>
  /** Whether the provider can resume an earlier session by id. */
  readonly supportsSessionResume: boolean
  /**
   * Per-mode reason a mode is currently disabled, or `null` when available.
   * The UI surfaces this string verbatim in the mode-picker tooltip
   * (REQ-MPS-008 / REQ-MPS-014).
   */
  readonly modeDisabledReason: Readonly<Record<ProviderMode, string | null>>
}
