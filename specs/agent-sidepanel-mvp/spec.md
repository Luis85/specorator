---
id: SPEC-ASM-001
title: "Agent Sidepanel MVP — Specification"
stage: specification
feature: agent-sidepanel-mvp
status: complete
owner: architect
inputs: [PRD-ASM-001, RES-ASM-001, DESIGN-ASM-001, IDEA-ASM-001]
adrs: [0029, 0030, 0031, 0032]
created: 2026-05-14
updated: 2026-05-14
---

# Specification — Agent Sidepanel MVP (Increment 1)

Implementation-ready contracts for Increment 1 of the Agent Sidepanel design brief. Every interface, algorithm, and component listed below is precise enough that two independent dev teams could implement the feature and produce indistinguishable behaviour. Every contract traces upward to one or more `REQ-ASM-NNN` / `NFR-ASM-NNN` IDs from `PRD-ASM-001` and, where load-bearing, to the four ADRs (0029, 0030, 0031, 0032).

---

## §1 — Summary and scope

### 1.1 What this spec covers

- A second transport (`ClaudeSubprocessAdapter`) that spawns the user's local `claude` binary behind the existing `ClaudeCliPort` narrow port (REQ-ASM-001, ADR-0029).
- A deterministic transport selector (`selectTransport`) and the plugin-wiring seam that supplies the chosen port through `CLAUDE_CLI_PORT` (REQ-ASM-002, REQ-ASM-003).
- A stage-aware system prompt assembled from `specs/<slug>/workflow-state.md` and prepended via `--append-system-prompt` (REQ-ASM-011…020).
- A structured-output pipeline producing validated `CreateFileEnvelope` proposals via `--output-format json --json-schema` and Zod revalidation (REQ-ASM-021…030, ADR-0030).
- Per-thread session persistence (`session_id` capture, `--resume`, vault-local session logs) (REQ-ASM-031…040, ADR-0031).
- Trust-first vault writes through `FileWriteProposalCard.vue`, `commitFileWriteProposal`, `ConfirmModalPort`, and `VaultPort` (REQ-ASM-041…050, ADR-0032).
- Reuse of the CCS chat panel (auto-context, file-menu, context preamble, token cap, error UI) (REQ-ASM-051…055).
- New settings: `claudeCliPath`, `transportKind`. New plugin-data blob key: `chatThreads`. New ESLint rule: `no-claude-home-reads` (NFR-ASM-004).

### 1.2 What this spec does not cover

- Autonomy dial, vault-folder filter, streaming step log, redirect/stop, Tasks tab, Session tab, undo window, slash palette, PR cards, stage tracker, lifecycle gate (Increments 2–5 per PRD-ASM-001).
- `editFile` / `deleteFile` / non-markdown proposal envelopes — schema is `createFile` only in Increment 1 (D-ASM-008). Forward-looking discriminated-union shape is declared in §2.4 so Increment 2 is additive.
- Server-side tool execution (REQ-ASM-028; D-ASM-010 — explicit denylist).
- In-product Agent-SDK credit metering (R-ASM-006).
- Mid-session transport switching (REQ-ASM-003; degraded state + reload only).

### 1.3 Non-overrides

The CCS shipped specification (`SPEC-CCS-001`) is preserved in full:

- `ClaudeCliPort` shape is unchanged (REQ-CCS-021). Both adapters implement the same four-method contract. A new optional fields-only extension is added to `ClaudeCliQueryOptions` (§2.6).
- `buildPrompt` (CCS §3) is reused unchanged. ASM prepends the stage preamble to the prompt assembled by `buildPrompt`; concatenation order is asserted (§3.2).
- `useChatStore` (CCS §4) is extended additively with `chatThreads`, `proposals`, and `streamingDeltas` state (§2.13). All existing fields and actions are preserved.

---

## §2 — Type contracts

All TypeScript signatures below are compiler-ready. No `any`. No unused imports. Fallible operations return `Result<T, E>` per ADR-004.

### 2.1 `TransportKind` and `TransportSelector` — REQ-ASM-001, REQ-ASM-002, REQ-ASM-003

```typescript
// src/domain/chat/TransportKind.ts
export type TransportKind = 'auto' | 'api-key' | 'subscription' | 'degraded'

// src/plugin/transport/TransportSelector.ts
import type { ClaudeCliPort } from '@/domain/ports/ClaudeCliPort'
import type { PluginSettings } from '@/domain/settings/PluginSettings'

export interface TransportSelection {
  readonly port: ClaudeCliPort
  readonly kind: Exclude<TransportKind, 'auto'>
}

export interface TransportSelectorDeps {
  readonly sdkAdapter: ClaudeCliPort
  readonly subscriptionAdapter: ClaudeCliPort
  readonly degradedPort: ClaudeCliPort
  readonly cliResolved: boolean
}

export type TransportSelectorFn = (
  settings: PluginSettings,
  deps: TransportSelectorDeps,
) => TransportSelection
```

The selector is the single place in the codebase that branches on transport. Unit-tested against the three-row truth table from REQ-ASM-002 (see §3.1).

### 2.2 `ChatThreadRecord` and `SessionId` — REQ-ASM-031, REQ-ASM-035, REQ-ASM-037

```typescript
// src/domain/chat/SessionId.ts
declare const SessionIdBrand: unique symbol
export type SessionId = string & { readonly [SessionIdBrand]: true }
export function asSessionId(raw: string): SessionId {
  return raw as SessionId
}

// src/domain/chat/ChatThreadRecord.ts
export interface ChatThreadRecord {
  readonly threadId: string // plugin-generated UUID v4
  readonly sessionId: SessionId | null
  readonly feature: string | null // active feature slug at thread creation
  readonly logPath: string // vault-relative
  readonly transport: 'api-key' | 'subscription'
  readonly createdAt: string // ISO 8601 UTC
  readonly lastUsedAt: string // ISO 8601 UTC
}
```

Stored under `_storedData.specorator.chatThreads` (§9.3).

### 2.3 `SessionLogFrontmatter` and `SessionLog` — REQ-ASM-033, REQ-ASM-046

```typescript
// src/application/chat/SessionLog.ts
export interface SessionLogFrontmatter {
  readonly session_id: string
  readonly feature: string | null
  readonly transport: 'api-key' | 'subscription'
  readonly created: string // ISO 8601 UTC
  readonly updated: string // ISO 8601 UTC
}

export interface SessionTurnBlock {
  readonly kind: 'turn'
  readonly user: string
  readonly assistant: string
  readonly at: string // ISO 8601 UTC
}

export interface SessionProposalBlock {
  readonly kind: 'proposal'
  readonly path: string
  readonly decision: 'accepted' | 'rejected'
  readonly decidedAt: string // ISO 8601 UTC
  readonly rationale: string | null
}

export type SessionLogBlock = SessionTurnBlock | SessionProposalBlock
```

### 2.4 Structured envelope — REQ-ASM-021, REQ-ASM-022, REQ-ASM-047 (ADR-0030, ADR-0032)

```typescript
// src/application/chat/proposalEnvelope.ts
import { z } from 'zod'

export const createFileEnvelopeSchema = z
  .object({
    action: z.literal('createFile'),
    path: z.string().regex(/^[^/].*\.md$/),
    content: z.string().min(1),
    rationale: z.string().optional(),
    folderHint: z.string().optional(),
  })
  .strict()
  .superRefine((env, ctx) => {
    if (env.folderHint !== undefined && env.folderHint.length > 0) {
      if (env.folderHint.startsWith('/')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'folderHint must not be absolute', path: ['folderHint'] })
        return
      }
      if (!env.path.startsWith(`${env.folderHint}/`)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'folderHint must be a prefix of path', path: ['folderHint'] })
      }
    }
  })

export type CreateFileEnvelope = z.infer<typeof createFileEnvelopeSchema>

/**
 * Forward-looking union — Increment-2 envelopes are added here as Zod discriminated
 * branches. Increment 1 ships `createFile` only.
 */
export type StructuredEnvelope =
  | CreateFileEnvelope
// | UpdateFileEnvelope (Increment 2)
// | DeleteFileEnvelope (Increment 2)

/** JSON Schema string passed to `claude --json-schema`. Generated once at module load. */
export declare const createFileEnvelopeJsonSchema: string

/**
 * Action-shape contracts for Increment 2 are pre-declared so the dev can reserve
 * file names. They are NOT exported in Increment 1; only the type names below leak
 * into TypeScript namespacing.
 */
export interface UpdateFileAction {
  readonly action: 'updateFile'
  readonly path: string
  readonly content: string
  readonly expectedHash?: string
  readonly rationale?: string
}

export interface DeleteFileAction {
  readonly action: 'deleteFile'
  readonly path: string
  readonly rationale?: string
}
```

### 2.5 `FileWriteProposal` — REQ-ASM-041, REQ-ASM-043, REQ-ASM-045

```typescript
// src/application/chat/FileWriteProposal.ts
import type { CreateFileEnvelope } from './proposalEnvelope'

export type FileWriteProposalStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'failed'

export interface FileWriteProposal {
  readonly proposalId: string // UUID v4
  readonly threadId: string
  readonly envelope: CreateFileEnvelope
  readonly status: FileWriteProposalStatus
  readonly proposedAt: string // ISO 8601 UTC
  readonly decidedAt: string | null
  readonly failureReason: CommitProposalErrorCode | null
}
```

The status field is the single source of truth for the card render state. Lifecycle: `pending` → (`accepted` | `rejected` | `failed`). Once decided, terminal.

### 2.6 Extensions to `ClaudeCliQueryOptions` — REQ-ASM-013, REQ-ASM-035 (additive)

```typescript
// src/domain/ports/ClaudeCliPort.ts (extension — existing shape preserved)
export interface ClaudeCliQueryOptions {
  readonly timeoutMs?: number // existing; clamped [1 000, 300 000]
  readonly maxTurns?: number // existing; clamped to 1

  /** NEW. Passed verbatim to --append-system-prompt; ignored by the SDK adapter. */
  readonly systemPromptSuffix?: string

  /** NEW. Subscription transport only — passed to --resume. SDK adapter logs debug + ignores. */
  readonly resumeSessionId?: string
}
```

The `ClaudeCliPort` interface itself is unchanged (REQ-ASM-001 / ADR-0029); only the options bag grows two optional readonly fields. Existing call sites that omit them are unaffected.

### 2.7 `ClaudeCliErrorCode` extensions — REQ-ASM-009, REQ-ASM-025, REQ-ASM-030

```typescript
// src/domain/ports/ClaudeCliPort.ts (extension)
export type ClaudeCliErrorCode =
  | 'NOT_INSTALLED'
  | 'API_KEY_MISSING'
  | 'TIMEOUT'
  | 'QUERY_FAILED'
  | 'CLI_LAUNCH_FAILED'       // NEW — spawn failed (R-ASM-002 AppArmor/userns)
```

`STRUCTURED_PARSE_FAILED` is **not** a `ClaudeCliErrorCode`. It lives on `EnvelopeParseError.errorCode` (§2.8) because parse failure is an application-layer concern, not a transport concern. Surfacing the two distinct errors to the same UI copy is the responsibility of `ChatResponse.vue` (§7.8), which inspects `error.name` to choose the message.

UI copy mapping (extends the CCS table):

| Code | Displayed as |
|---|---|
| `CLI_LAUNCH_FAILED` | "Chat needs the Claude command-line tool." (REQ-ASM-009) |
| `EnvelopeParseError` (any `kind`) | "Assistant returned an unexpected response. Please try again." (REQ-ASM-025) |

### 2.8 `ClaudeSubscriptionError` and parse / commit errors — REQ-ASM-023, REQ-ASM-025, REQ-ASM-044, REQ-ASM-048

```typescript
// src/application/chat/errors.ts
export type EnvelopeParseFailureKind =
  | 'STRUCTURED_OUTPUT_MISSING'
  | 'PRIMARY_ZOD_FAILED'
  | 'FALLBACK_EXTRACTION_FAILED'
  | 'FALLBACK_JSON_PARSE_FAILED'
  | 'FALLBACK_ZOD_FAILED'

export class EnvelopeParseError extends Error {
  public readonly name = 'EnvelopeParseError'
  public readonly errorCode = 'STRUCTURED_PARSE_FAILED' as const
  constructor(
    public readonly kind: EnvelopeParseFailureKind,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export type PathValidationFailureKind =
  | 'EMPTY'
  | 'CONTAINS_DOTDOT'
  | 'LEADING_SLASH'
  | 'ESCAPES_VAULT_ROOT'
  | 'BAD_EXTENSION'

export class PathValidationError extends Error {
  public readonly name = 'PathValidationError'
  public readonly errorCode = 'PATH_INVALID' as const
  constructor(
    public readonly kind: PathValidationFailureKind,
    message: string,
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export type CommitProposalErrorCode =
  | 'OVERWRITE_CANCELLED'
  | 'FOLDER_CREATE_FAILED'
  | 'WRITE_FAILED'
  | 'SESSION_LOG_FAILED'

export class CommitProposalError extends Error {
  public readonly name = 'CommitProposalError'
  constructor(
    public readonly errorCode: CommitProposalErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** Subscription-transport specific errors that compose into ClaudeCliError. */
export type ClaudeSubscriptionErrorCode =
  | 'BINARY_NOT_FOUND'
  | 'BINARY_NOT_ABSOLUTE'
  | 'SPAWN_FAILED'
  | 'NON_ZERO_EXIT'
  | 'STDOUT_INVALID_JSON'

export class ClaudeSubscriptionError extends Error {
  public readonly name = 'ClaudeSubscriptionError'
  constructor(
    public readonly errorCode: ClaudeSubscriptionErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
```

All five error classes extend `Error` and are returned via `Result.error` — never thrown across a port boundary.

### 2.9 `ClaudeSubscriptionTransportPort` (infra-internal, structured capability) — REQ-ASM-021, REQ-ASM-049

The narrow port `ClaudeCliPort` (REQ-ASM-001) is unchanged. A second, infrastructure-internal capability is exposed via a tagged `kind` discriminator on the subscription adapter and is reached only through `queryStructured` in the application layer.

```typescript
// src/application/chat/queryStructured.ts (type seam)
import type { ClaudeCliPort, ClaudeCliError, ClaudeCliQueryOptions } from '@/domain/ports/ClaudeCliPort'
import type { Result } from '@/domain/shared/Result'
import type { CreateFileEnvelope } from './proposalEnvelope'
import type { EnvelopeParseError } from './errors'

export interface StructuredCliRawResult {
  readonly result: string
  readonly structured_output: unknown
}

export interface StructuredCliCallOptions {
  readonly systemPromptSuffix?: string
  readonly resumeSessionId?: string
  readonly timeoutMs?: number
}

/**
 * Tagged capability: only the subscription adapter declares `kind === 'subscription'`.
 * The SDK adapter has no `kind` field; the user-defined type guard `isSubscriptionCapable`
 * fails closed for it.
 */
export interface SubscriptionCapable extends ClaudeCliPort {
  readonly kind: 'subscription'
  runStructured(
    prompt: string,
    options: StructuredCliCallOptions,
  ): Promise<Result<StructuredCliRawResult, ClaudeCliError>>
}

export function isSubscriptionCapable(port: ClaudeCliPort): port is SubscriptionCapable {
  return (port as { kind?: string }).kind === 'subscription'
}

export function queryStructured(
  port: ClaudeCliPort,
  prompt: string,
  options: StructuredCliCallOptions,
): Promise<Result<CreateFileEnvelope, EnvelopeParseError | ClaudeCliError>>
```

The SDK adapter is **not** structurally compatible with `SubscriptionCapable`; structured calls return `Result.error(ClaudeCliError{ NOT_INSTALLED })` on the SDK path. This preserves narrow-port discipline (ADR-008, D-ASM-111).

### 2.10 `ConfirmModalPort` — REQ-ASM-044 (ADR-0032)

```typescript
// src/domain/ports/ConfirmModalPort.ts
export interface ConfirmModalRequest {
  readonly title: string
  readonly body: string
  readonly confirmLabel: string
  readonly cancelLabel: string
}

export interface ConfirmModalPort {
  /**
   * Renders a modal yes/no prompt; resolves to true on confirm, false on cancel
   * or Escape. Never throws.
   */
  show(args: ConfirmModalRequest): Promise<boolean>
}
```

InjectionKey: `CONFIRM_MODAL_PORT` (§10.1).

Implementations:

- `ObsidianConfirmModal` (`src/infrastructure/obsidian/ObsidianConfirmModal.ts`) — wraps an Obsidian `Modal` subclass.
- `FakeConfirmModal` (`tests/__fakes__/FakeConfirmModal.ts`) — field-driven (`nextResult: boolean`, `calls: ConfirmModalRequest[]`).

### 2.11 `WorkflowStateSnapshot` and `StagePromptMap` — REQ-ASM-012, REQ-ASM-013, REQ-ASM-017

```typescript
// src/application/chat/WorkflowStateSnapshot.ts
import type { FeatureStepSlug } from '@/domain/feature/FeatureStep'

export interface WorkflowStateSnapshot {
  readonly feature: string
  readonly stage: FeatureStepSlug | string // tolerant of non-canonical slugs
  readonly status: string
}

// src/application/chat/stagePromptMap.ts
import type { FeatureStepSlug } from '@/domain/feature/FeatureStep'

export interface StageDescriptor {
  readonly displayName: string
  readonly oneLineDescription: string
}

export interface StagePromptMap {
  /** Returns null when slug is not a known FEATURE_STEPS member. */
  get(slug: FeatureStepSlug | string): StageDescriptor | null
}

export function buildStagePromptMap(): StagePromptMap
```

`buildStagePromptMap()` is the single source of stage descriptions. It iterates `FEATURE_STEPS` from `src/domain/feature/FeatureStep.ts` and pairs each slug with a one-sentence description maintained in the same module. No stage descriptions are hard-coded inside `assembleSystemPrompt` (REQ-ASM-017).

### 2.12 `PluginSettings` extensions — REQ-ASM-002, REQ-ASM-004

```typescript
// src/domain/settings/PluginSettings.ts (extension — additive)
import type { TransportKind } from '@/domain/chat/TransportKind'

export interface PluginSettings {
  // ... existing fields including anthropicApiKey, specsFolder, logLevel ...

  /** Absolute filesystem path to the user's `claude` binary. Empty string = unset. */
  readonly claudeCliPath: string

  /** Selection mode: 'auto' applies REQ-ASM-002 precedence. */
  readonly transportKind: TransportKind
}

export const DEFAULT_SETTINGS: PluginSettings = {
  // ... existing defaults ...
  claudeCliPath: '',
  transportKind: 'auto',
}
```

Migration: `PLUGIN_SETTINGS_KEYS` in `src/plugin/loadSettings-migrate.ts` is extended to include `'claudeCliPath'` and `'transportKind'` so legacy flat blobs promote them too (§11.1).

### 2.13 `useChatStore` extensions — REQ-ASM-031, REQ-ASM-037, REQ-ASM-041

```typescript
// src/ui/stores/chatStore.ts (extension — additive)
import type { ChatThreadRecord, SessionId } from '@/domain/chat/ChatThreadRecord'
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal'

// New state (additive — existing fields preserved):
//   chatThreads:    Ref<Map<string, ChatThreadRecord>>     keyed by threadId
//   activeThreadId: Ref<string | null>                     UUID v4 of current thread
//   proposals:      Ref<Map<string, FileWriteProposal>>    keyed by proposalId
//   streamingText:  Ref<string>                            accumulated stream_event deltas
//   cliStartingUp:  Ref<boolean>                           drives SubprocessStartingPill
//   sessionResumed: Ref<boolean>                           drives SessionResumeIndicator

// New actions:
//   upsertThread(record: ChatThreadRecord): void
//   setActiveThreadId(threadId: string | null): void
//   captureSessionId(threadId: string, sessionId: SessionId): void
//   markThreadUsed(threadId: string): void
//   appendStreamingDelta(delta: string): void
//   resetStreaming(): void
//   addProposal(proposal: FileWriteProposal): void
//   setProposalStatus(proposalId: string, status: FileWriteProposalStatus, failureReason?: CommitProposalErrorCode): void
//   setCliStartingUp(value: boolean): void
//   setSessionResumed(value: boolean): void
```

All new state is plain DTO (no domain class instances cross the store boundary — CLAUDE.md Vue conventions).

---

## §3 — Algorithms

Every algorithm below is deterministic; no implicit defaults; every input maps to one and only one branch.

### 3.1 `selectTransport(settings, deps)` — REQ-ASM-002, REQ-ASM-003

**File:** `src/plugin/transport/TransportSelector.ts`
**Signature:** `(settings: PluginSettings, deps: TransportSelectorDeps) => TransportSelection`
**Purity:** synchronous, no I/O.

Deterministic decision table (evaluated top-to-bottom; first match wins):

| Row | `settings.transportKind` | `settings.anthropicApiKey.trim() !== ''` | `deps.cliResolved` | Result |
|---|---|---|---|---|
| R1 | `'degraded'` | * | * | `{ port: degradedPort, kind: 'degraded' }` |
| R2 | `'api-key'` | true | * | `{ port: sdkAdapter, kind: 'api-key' }` |
| R3 | `'api-key'` | false | * | `{ port: degradedPort, kind: 'degraded' }` |
| R4 | `'subscription'` | * | true | `{ port: subscriptionAdapter, kind: 'subscription' }` |
| R5 | `'subscription'` | * | false | `{ port: degradedPort, kind: 'degraded' }` |
| R6 | `'auto'` | true | * | `{ port: sdkAdapter, kind: 'api-key' }` |
| R7 | `'auto'` | false | true | `{ port: subscriptionAdapter, kind: 'subscription' }` |
| R8 | `'auto'` | false | false | `{ port: degradedPort, kind: 'degraded' }` |

`cliResolved` is the boolean result of `subscriptionAdapter.isAvailable()` evaluated synchronously from cached state populated by `startup()`. The selector itself does **not** invoke I/O.

### 3.2 `assembleSystemPrompt(snapshot, stageMap, options?)` — REQ-ASM-013, REQ-ASM-014, REQ-ASM-016, REQ-ASM-019, REQ-ASM-020

**File:** `src/application/chat/assembleSystemPrompt.ts`
**Signature:**

```typescript
export function assembleSystemPrompt(
  snapshot: WorkflowStateSnapshot | null,
  stageMap: StagePromptMap,
  options?: { readonly maxChars?: number },
): string
```

Pure. No I/O. Default `maxChars = 2_000` (REQ-ASM-020).

Algorithm:

1. If `snapshot === null` → return `''` (REQ-ASM-014).
2. `descriptor = stageMap.get(snapshot.stage)`.
3. If `descriptor === null` → return `''` (unknown stage; treated as fallback per REQ-ASM-015).
4. `body = "You are assisting with feature \"" + snapshot.feature + "\" at the \"" + descriptor.displayName + "\" stage.\n" + descriptor.oneLineDescription`.
5. If `body.length <= maxChars` → return `body`.
6. `boundary = body.lastIndexOf('. ', maxChars - 1)`. If `boundary >= 0` → return `body.slice(0, boundary + 1)`.
7. Otherwise → return `body.slice(0, maxChars)`.

Body never contains raw `workflow-state.md` content (REQ-ASM-016): the function reads only `feature`, `stage`, and the static `oneLineDescription` from `stageMap`. The function is called at every `send` invocation (REQ-ASM-019) — no caching.

Concatenation order at send time (asserted by unit test):

1. Stage preamble from `assembleSystemPrompt` (if non-empty).
2. CCS context preamble assembled by `buildPrompt` (REQ-ASM-054).
3. User text (CCS).
4. On structured calls only: literal suffix `"\n\nReturn only the JSON object — no commentary."` appended to the `systemPromptSuffix` argument before passing to the port (REQ-ASM-026).

### 3.3 `parseStructuredEnvelope(rawResponse)` — REQ-ASM-023, REQ-ASM-024, REQ-ASM-025

**File:** `src/application/chat/parseStructuredEnvelope.ts`
**Signature:**

```typescript
export function parseStructuredEnvelope(
  raw: StructuredCliRawResult,
): Result<CreateFileEnvelope, EnvelopeParseError>
```

Synchronous; pure. Four-step pipeline:

1. **Prefer `.structured_output`.** If `raw.structured_output !== undefined && raw.structured_output !== null`:
   - `parsed = createFileEnvelopeSchema.safeParse(raw.structured_output)`.
   - If `parsed.success` → return `ok(parsed.data)`.
   - Otherwise → record kind `'PRIMARY_ZOD_FAILED'`; fall through to step 2.
2. **Brace-depth scan of `.result`.** Call `extractFirstBalancedObject(raw.result)`:
   - Returns `null` if no balanced `{…}` block is found → return `err(EnvelopeParseError('FALLBACK_EXTRACTION_FAILED', ...))`.
   - Otherwise returns the substring from the matched `{` to its balancing `}`. The scanner tracks string state (inside vs outside `"`) and escape state (`\"`); braces inside string literals do not affect depth.
3. **JSON.parse on the extracted substring.** Wrap in try/catch:
   - On `SyntaxError` → return `err(EnvelopeParseError('FALLBACK_JSON_PARSE_FAILED', ..., e))`.
4. **Zod validation of the parsed object.**
   - `parsed = createFileEnvelopeSchema.safeParse(jsonParseResult)`.
   - If `parsed.success` → return `ok(parsed.data)`.
   - Otherwise → return `err(EnvelopeParseError('FALLBACK_ZOD_FAILED', ...))`.

If `raw.structured_output === undefined` at step 1 entry, the kind recorded at step 1 is `'STRUCTURED_OUTPUT_MISSING'` (used only if all fallbacks subsequently fail). The fallback parser is exported as `extractFirstBalancedObject(input: string): string | null` for direct unit testing.

### 3.4 `validateProposalPath(envelope, vaultRoot)` — REQ-ASM-048

**File:** `src/application/chat/validateProposalPath.ts`
**Signature:**

```typescript
export function validateProposalPath(
  envelope: CreateFileEnvelope,
  vaultRoot: string,
): Result<CreateFileEnvelope, PathValidationError>
```

Pure. Algorithm:

1. If `envelope.path.length === 0` → `err(PathValidationError('EMPTY', ...))`.
2. If `envelope.path.startsWith('/')` → `err('LEADING_SLASH')`.
3. If `envelope.path.split('/').includes('..')` → `err('CONTAINS_DOTDOT')`.
4. If `!envelope.path.endsWith('.md')` → `err('BAD_EXTENSION')` (defence-in-depth — Zod regex already enforces).
5. Compute `resolved = posixNormalize(vaultRoot + '/' + envelope.path)` and `root = posixNormalize(vaultRoot + '/')`. If `!resolved.startsWith(root)` → `err('ESCAPES_VAULT_ROOT')`.
6. Otherwise → `ok(envelope)`.

`posixNormalize` is a pure helper exported from the same module that collapses `./` segments and dedupes `//` without touching the filesystem.

### 3.5 `proposeFileWrite(envelope, vault)` — REQ-ASM-041 (read-only inspection)

**File:** `src/application/chat/proposeFileWrite.ts`
**Signature:**

```typescript
export interface ProposalPreview {
  readonly envelope: CreateFileEnvelope
  readonly targetExists: boolean
  /** Diff is null in Increment 1 (createFile only). Reserved for Increment 2 updateFile. */
  readonly diff: null
}

export async function proposeFileWrite(
  envelope: CreateFileEnvelope,
  vault: VaultPort,
): Promise<Result<ProposalPreview, VaultReadError>>
```

Read-only. Does **not** mutate the vault. Algorithm:

1. `exists = await vault.fileExists(envelope.path)`. On thrown error → wrap in `Result.error(VaultReadError)`.
2. Return `ok({ envelope, targetExists: exists, diff: null })`.

For Increment 2 the function will, when `envelope.action === 'updateFile'`, also `vault.readFile(envelope.path)` and compute a unified diff against `envelope.content`. The signature reserves the `diff` field as `null` in Increment 1 so the UI prop shape is forward-compatible.

### 3.6 `commitFileWriteProposal(proposal, deps)` — REQ-ASM-043, REQ-ASM-044, REQ-ASM-047 (NFR-ASM-011)

**File:** `src/application/chat/commitFileWriteProposal.ts`
**Signature:**

```typescript
export interface CommitFileWriteDeps {
  readonly vault: VaultPort
  readonly logger: LoggerPort
  readonly sessionLog: SessionLogWriter
  readonly confirmModal: ConfirmModalPort
  readonly i18n: TranslationPort
  readonly nowIso: () => string
}

export async function commitFileWriteProposal(
  proposal: FileWriteProposal,
  thread: ChatThreadRecord,
  deps: CommitFileWriteDeps,
): Promise<Result<void, CommitProposalError>>
```

**Trust-first invariant (verbatim):** `commitFileWriteProposal` is the only function in the codebase that, on behalf of a model proposal, calls `VaultPort.writeFile`. No other code path mutates the vault from an LLM response. The Accept button click handler in `FileWriteProposalCard.vue` is the sole call site (NFR-ASM-011).

Algorithm:

1. **Overwrite guard (REQ-ASM-044).** `exists = await deps.vault.fileExists(proposal.envelope.path)`.
   - If `exists === true`:
     - `confirmed = await deps.confirmModal.show({ title: deps.i18n.t('chat.proposal.overwriteTitle'), body: deps.i18n.t('chat.proposal.overwriteBody', { path: proposal.envelope.path }), confirmLabel: deps.i18n.t('chat.proposal.overwriteConfirm'), cancelLabel: deps.i18n.t('chat.proposal.overwriteCancel') })`.
     - If `confirmed === false` → return `err(new CommitProposalError('OVERWRITE_CANCELLED', 'User cancelled overwrite.'))`. **No further VaultPort calls.**
2. **Folder hint (REQ-ASM-047).** If `proposal.envelope.folderHint` is a non-empty string:
   - `try { await deps.vault.createFolder(proposal.envelope.folderHint) } catch (e) { return err(new CommitProposalError('FOLDER_CREATE_FAILED', 'Could not create folder.', e)) }` (idempotent at the port level; ENOENT-on-already-exists is swallowed by the bridge).
3. **Write (REQ-ASM-043).** `try { await deps.vault.writeFile(proposal.envelope.path, proposal.envelope.content) } catch (e) { return err(new CommitProposalError('WRITE_FAILED', 'Could not write file.', e)) }`.
4. **Audit log (REQ-ASM-046).** `try { await deps.sessionLog.appendProposalDecision({ thread, proposal, decision: 'accepted', decidedAt: deps.nowIso() }) } catch (e) { deps.logger.error('SessionLog append failed', { redactedSessionId: redact(thread.sessionId) }, e); return err(new CommitProposalError('SESSION_LOG_FAILED', 'Audit log write failed.', e)) }`. The audit row is awaited inline and a failure surfaces to the caller as `Result.error` — a vault-mutating action without its audit row is treated as a hard failure (REQ-ASM-046, §13.4). The vault write is not rolled back; the caller may retry or escalate. This is the single departure from the §6.7 fire-and-forget rule, which applies to non-critical-path `appendUserAssistant` writes only.
5. Return `ok(undefined)`.

**Reject path** is a separate function:

```typescript
export async function rejectFileWriteProposal(
  proposal: FileWriteProposal,
  thread: ChatThreadRecord,
  deps: Pick<CommitFileWriteDeps, 'sessionLog' | 'logger' | 'nowIso'>,
): Promise<void>
```

Calls `sessionLog.appendProposalDecision({ thread, proposal, decision: 'rejected', decidedAt: nowIso() })` only. **No VaultPort method is invoked** (REQ-ASM-045).

### 3.7 `buildSubprocessArgs(prompt, options, sessionId, jsonSchema?)` — REQ-ASM-006, REQ-ASM-021, REQ-ASM-026, REQ-ASM-027, REQ-ASM-028, REQ-ASM-035

**File:** `src/infrastructure/obsidian/buildSubprocessArgs.ts`
**Signature:**

```typescript
export interface BuildSubprocessArgsInput {
  readonly prompt: string
  readonly systemPromptSuffix: string // '' permitted; '' → flag omitted
  readonly resumeSessionId: string | null
  readonly jsonSchema: string | null // null = free-text path; non-null = structured path
}

export function buildSubprocessArgs(input: BuildSubprocessArgsInput): readonly string[]
```

Pure. Single source of truth for argv assembly. Algorithm:

1. `argv = ['-p', input.prompt]`.
2. **Framing branch:**
   - If `input.jsonSchema === null` (free-text):
     - Push `'--output-format', 'stream-json', '--verbose', '--include-partial-messages'` (REQ-ASM-027).
   - If `input.jsonSchema !== null` (structured):
     - Push `'--output-format', 'json', '--json-schema', input.jsonSchema` (REQ-ASM-021).
3. **System prompt suffix** (REQ-ASM-013, REQ-ASM-026): if `input.systemPromptSuffix.length > 0` → push `'--append-system-prompt', input.systemPromptSuffix`.
4. **Tools denylist** (REQ-ASM-028): push `'--permission-mode', 'dontAsk', '--disallowedTools', 'Read,Edit,Write,Bash,Glob,Grep,WebFetch,WebSearch'`.
5. **Session resume** (REQ-ASM-035): if `input.resumeSessionId !== null && input.resumeSessionId.length > 0` → push `'--resume', input.resumeSessionId`.
6. Return `Object.freeze(argv)`.

**Invariants (assert-in-tests):**

| INV | Description | REQ |
|---|---|---|
| INV-1 | `argv` never contains `'--bare'` | REQ-ASM-006 |
| INV-2 | `argv` always contains `'--permission-mode'` followed by `'dontAsk'` and `'--disallowedTools'` followed by the literal denylist string | REQ-ASM-028 |
| INV-3 | When `jsonSchema === null`: argv contains `'stream-json'`, `'--verbose'`, `'--include-partial-messages'` and does NOT contain `'--json-schema'` | REQ-ASM-027 |
| INV-4 | When `jsonSchema !== null`: argv contains `'json'`, `'--json-schema'`, and the schema string; argv does NOT contain `'stream-json'` or `'--include-partial-messages'` | REQ-ASM-021 |
| INV-5 | `'--resume'` appears at most once and only when `resumeSessionId` is a non-empty string | REQ-ASM-035 |
| INV-6 | `'--append-system-prompt'` appears at most once and only when `systemPromptSuffix.length > 0` | REQ-ASM-013, REQ-ASM-014 |

---

## §4 — `ClaudeSubprocessAdapter` class outline

**File:** `src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts`
**Implements:** `ClaudeCliPort` and (structurally) `SubscriptionCapable` via a public `readonly kind = 'subscription'`.

**ToS posture (verbatim, NFR-ASM-004):** this class never reads, opens, copies, transmits, persists, or watches `~/.claude/.credentials.json` or any file under `~/.claude/`. The only interaction with `~/.claude/` is that the spawned `claude` binary, executing under the user's own UID, may read its own credentials as part of the user's own invocation — this is the user's tool, not the plugin's read.

### 4.1 Constructor and fields

```typescript
export interface ClaudeSubprocessAdapterDeps {
  readonly getSettings: () => PluginSettings
  readonly logger: LoggerPort
  readonly resolveCliPath: () => Promise<string | null> // injectable for tests
  readonly spawn: typeof import('child_process').spawn // injectable for tests
  readonly now: () => number
}

class ClaudeSubprocessAdapter implements ClaudeCliPort {
  public readonly kind = 'subscription' as const

  private _available = false
  private _ready = false
  private _binaryPath: string | null = null
  private _streamingProc = new Map<string, ChildProcess>() // keyed by threadId

  constructor(private readonly deps: ClaudeSubprocessAdapterDeps) {}
}
```

### 4.2 Method signatures and behaviour notes

| Method | Signature | Behaviour (one-liner per method) |
|---|---|---|
| `startup` | `(): Promise<void>` | Idempotent. Resolves `_binaryPath` from `settings.claudeCliPath` then `deps.resolveCliPath()`; sets `_available` accordingly (REQ-ASM-009, NFR-ASM-006). |
| `isAvailable` | `(): Promise<boolean>` | Returns `_available && _binaryPath !== null`. Never throws. |
| `isAvailableSync` | `(): boolean` | **Class-only, not on `ClaudeCliPort`.** Returns the cached `_available` flag (set by `startup()`). Performs **no I/O**, never spawns, never throws. Used by `selectTransport()` in plugin wiring (§9.1) where a synchronous boolean is required at view-registration time. Contrast with `isAvailable()` which returns `Promise<boolean>` for the public port surface. |
| `query` | `(prompt, options?): Promise<Result<string, ClaudeCliError>>` | Free-text stream-json path: `_spawn` long-lived process keyed by `threadId` (REQ-ASM-010), `_parseNdjson`, capture session id (REQ-ASM-031), map errors via `_mapError`. |
| `runStructured` | `(prompt, options): Promise<Result<StructuredCliRawResult, ClaudeCliError>>` | One-shot short-lived spawn (REQ-ASM-049). Collects entire stdout to a buffer; `JSON.parse`; returns `{ result, structured_output }`. Reached from the application layer via `queryStructured()` after `isSubscriptionCapable(port)` narrows the port. There is no `queryStructured` method on the adapter or on `ClaudeCliPort`. |
| `shutdown` | `(): void` | Synchronous. For every entry in `_streamingProc`: `child.kill('SIGTERM')`. Clears map. Sets `_ready = false`, `_available = false`. Never throws. |

### 4.3 Private helpers

| Helper | Signature | Behaviour |
|---|---|---|
| `_spawn` | `(argv: readonly string[], threadId: string \| null): ChildProcess` | Calls `deps.spawn(_binaryPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] })`. If `threadId !== null` and structured-mode is false, registers the child in `_streamingProc`. Throws → caught by caller and mapped to `CLI_LAUNCH_FAILED`. |
| `_parseNdjson` | `(child: ChildProcess, onSystemInit: (id: SessionId) => void, onStreamEvent: (delta: string) => void): Promise<{ result: string; isError: boolean }>` | Uses `readline.createInterface({ input: child.stdout })`. For each line: `JSON.parse` (drop unparseable lines with debug log); dispatch by `type`. Resolves with the `result` event's payload or rejects via the close handler (REQ-ASM-029, REQ-ASM-030). |
| `_captureSessionId` | `(event: { type: 'system/init'; session_id: string }, callback: (id: SessionId) => void): void` | Validates `session_id` is a non-empty string; calls `callback(asSessionId(event.session_id))`. |
| `_clampTimeout` | `(raw?: number): number` | `Math.min(Math.max(raw ?? 30_000, 1_000), 300_000)`. |
| `_kill` | `(child: ChildProcess): void` | `child.kill('SIGTERM')`; if still alive after 200 ms, `child.kill('SIGKILL')`. Listener cleanup (`removeAllListeners`) is unconditional. |
| `_mapError` | `(e: unknown, ctx: { timeoutMs: number; exitCode: number \| null }): ClaudeCliError` | Mapping rules in §4.4. |

### 4.4 Error mapping (`_mapError`)

| Condition | Returned `ClaudeCliErrorCode` |
|---|---|
| Timeout exceeded (`Date.now() - startedAt > timeoutMs`) | `TIMEOUT` |
| `e instanceof Error && (e as NodeJS.ErrnoException).code === 'ENOENT'` | `CLI_LAUNCH_FAILED` |
| Spawn error before any stdout (`e.code === 'EACCES'`, `'EPERM'`, `'EAGAIN'`) | `CLI_LAUNCH_FAILED` |
| `ctx.exitCode !== null && ctx.exitCode !== 0` | `QUERY_FAILED` |
| `result` event with `is_error === true` | `QUERY_FAILED` |
| `JSON.parse` failure on structured stdout | `QUERY_FAILED` |
| Unknown | `QUERY_FAILED` |

**Logging discipline (NFR-ASM-005, NFR-ASM-012):** every log line includes only `{ transport: 'subscription', sessionId: redact(thread.sessionId), durationMs, exitCode }`. Never log the binary path, the user prompt body, the `--append-system-prompt` content, the user's home directory, or any portion of stdout/stderr that may carry a path.

### 4.5 Long-lived vs. short-lived process discipline

- **Free-text (`query`)**: long-lived `ChildProcess` per `threadId` (REQ-ASM-010). Reused across turns. On second and subsequent turns of the same thread, `_spawn` is called only if the prior child has exited; otherwise the existing handle is reused.
- **Structured (`runStructured`)**: short-lived process per call (REQ-ASM-049). Never registered in `_streamingProc`. Process exits cleanly after the single `result` event.

---

## §5 — `MockClaudeSubprocessAdapter`

**File:** `src/infrastructure/mock/MockClaudeSubprocessAdapter.ts`
**Implements:** `ClaudeCliPort` and `SubscriptionCapable` (`readonly kind = 'subscription'`).

Mirrors the field-driven pattern from `MockClaudeCliPort` (CCS SPEC §6). Used by `fakeModulePorts()` (ADR-009) to exercise structured-output, session capture, and proposal flows without a real `claude` binary.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `available` | `boolean` | `true` | Drives `isAvailable()` and the no-op branches of `query`/`runStructured`. |
| `cannedSessionId` | `string` | `'mock-session-0001'` | Emitted as `session_id` on the simulated `system/init` event. |
| `cannedFreeTextResponse` | `string` | `'Mock subscription response.'` | Result returned by `query()`. |
| `cannedStreamDeltas` | `readonly string[]` | `[]` | When non-empty, `query()` invokes the per-delta callback once per element before resolving. |
| `cannedStructuredEnvelope` | `CreateFileEnvelope \| null` | A valid sample `createFile` envelope (see §5.1) | Used by `runStructured()`. |
| `cannedStructuredRawResult` | `string` | `''` | `.result` field returned alongside `structured_output`; used to test the fallback parser when `cannedStructuredEnvelope === null`. |
| `queryError` | `ClaudeCliError \| null` | `null` | If non-null, both `query()` and `runStructured()` return this error. |
| `delayMs` | `number` | `0` | Artificial delay before resolution. |
| `queryLog` | `readonly string[]` | `[]` | Append-only log of every prompt passed to either method. |
| `argsLog` | `readonly (readonly string[])[]` | `[]` | Append-only log of every argv array passed through `buildSubprocessArgs` — used for INV-1…INV-6 assertions. |
| `kindFlag` | `'subscription'` (readonly) | `'subscription'` | Tagged discriminator. |

### 5.1 Default `cannedStructuredEnvelope`

```typescript
{
  action: 'createFile',
  path: 'specs/mock/idea.md',
  content: '# Mock idea\n\nGenerated by MockClaudeSubprocessAdapter.\n',
  rationale: 'Demonstrates a valid createFile proposal for tests.',
  folderHint: 'specs/mock',
}
```

`startup()` is a no-op. `shutdown()` clears `queryLog` and `argsLog`. `isAvailableSync()` returns the `available` field synchronously (mirrors the adapter's class-only synchronous accessor; performs no I/O).

---

## §6 — Application-layer services

Every module path below is canonical. Every exported function returns `Result<T, E>` if fallible.

### 6.1 `src/application/chat/selectTransport.ts`

Re-exports `selectTransport` from `src/plugin/transport/TransportSelector.ts` (the function is plugin-layer code; the re-export keeps UI/test imports stable). Signature: see §2.1.

### 6.2 `src/application/chat/assembleSystemPrompt.ts`

```typescript
export interface WorkflowStateSnapshot { /* §2.11 */ }

export function assembleSystemPrompt(
  snapshot: WorkflowStateSnapshot | null,
  stageMap: StagePromptMap,
  options?: { readonly maxChars?: number },
): string

export async function loadWorkflowStateSnapshot(
  feature: string,
  vault: VaultPort,
  logger: LoggerPort,
  specsFolder: string,
): Promise<WorkflowStateSnapshot | null>
```

`loadWorkflowStateSnapshot` reads `<specsFolder>/<feature>/workflow-state.md` via `VaultPort.readFile`, parses YAML frontmatter, returns `{ feature, stage, status }`. On any read/parse failure, calls `logger.warn(...)` once and returns `null` (REQ-ASM-015). Never throws.

```typescript
export function getActiveFeatureSlug(
  activeFilePath: string | null,
  specsFolder: string,
): string | null
```

Pure. Matches `^<specsFolder>/([^/]+)/`. Returns the slug or `null` (REQ-ASM-011).

### 6.3 `src/application/chat/parseStructuredEnvelope.ts`

```typescript
export function parseStructuredEnvelope(
  raw: StructuredCliRawResult,
): Result<CreateFileEnvelope, EnvelopeParseError>

export function extractFirstBalancedObject(input: string): string | null
```

Algorithm: §3.3.

### 6.4 `src/application/chat/proposeFileWrite.ts`

```typescript
export interface ProposalPreview { /* §3.5 */ }

export async function proposeFileWrite(
  envelope: CreateFileEnvelope,
  vault: VaultPort,
): Promise<Result<ProposalPreview, VaultReadError>>
```

Read-only; never calls a vault mutation method (REQ-ASM-041).

### 6.5 `src/application/chat/commitFileWriteProposal.ts`

```typescript
export interface CommitFileWriteDeps { /* §3.6 */ }

export async function commitFileWriteProposal(
  proposal: FileWriteProposal,
  thread: ChatThreadRecord,
  deps: CommitFileWriteDeps,
): Promise<Result<void, CommitProposalError>>

export async function rejectFileWriteProposal(
  proposal: FileWriteProposal,
  thread: ChatThreadRecord,
  deps: Pick<CommitFileWriteDeps, 'sessionLog' | 'logger' | 'nowIso'>,
): Promise<void>
```

`commitFileWriteProposal` is the **only** vault-mutation path from a model proposal in Increment 1 (NFR-ASM-011; verbatim guarantee in §3.6).

### 6.6 `src/application/chat/queryStructured.ts`

```typescript
export interface StructuredCliRawResult { /* §2.9 */ }
export interface StructuredCliCallOptions { /* §2.9 */ }
export interface SubscriptionCapable extends ClaudeCliPort { /* §2.9 */ }

export function isSubscriptionCapable(port: ClaudeCliPort): port is SubscriptionCapable

export async function queryStructured(
  port: ClaudeCliPort,
  prompt: string,
  options: StructuredCliCallOptions,
): Promise<Result<CreateFileEnvelope, EnvelopeParseError | ClaudeCliError>>
```

Algorithm:

1. If `!isSubscriptionCapable(port)` → return `err(new ClaudeCliError('NOT_INSTALLED', 'Structured output requires the subscription transport.'))`.
2. `raw = await port.runStructured(prompt, options)`.
3. If `!raw.ok` → return `err(raw.error)`.
4. Return `parseStructuredEnvelope(raw.value)`.

### 6.7 `src/application/chat/sessionLogPath.ts` and `SessionLogWriter.ts` — REQ-ASM-032, REQ-ASM-038, REQ-ASM-039

```typescript
// sessionLogPath.ts
export function resolveSessionLogPath(
  feature: string | null,
  sessionId: string,
  specsFolder: string,
): string
```

Returns `<specsFolder>/<feature>/sessions/<sessionId>.md` when `feature !== null`; otherwise `.specorator/sessions/<sessionId>.md` (REQ-ASM-032).

```typescript
// SessionLogWriter.ts
export class SessionLogWriter {
  constructor(
    private readonly vault: VaultPort,
    private readonly logger: LoggerPort,
    private readonly specsFolder: string,
    private readonly nowIso: () => string,
  )

  ensureSessionsFolder(feature: string | null): Promise<Result<void, VaultWriteError>>

  appendUserAssistant(
    thread: ChatThreadRecord,
    turn: { readonly user: string; readonly assistant: string },
  ): Promise<void>

  appendProposalDecision(args: {
    readonly thread: ChatThreadRecord
    readonly proposal: FileWriteProposal
    readonly decision: 'accepted' | 'rejected'
    readonly decidedAt: string
  }): Promise<void>
}
```

Behaviour:

- Per-log-file mutex (`Map<logPath, Promise<void>>`) serialises writes (REQ-ASM-040).
- On first write to a given path, calls `vault.createFolder(dirname(path))` (REQ-ASM-038).
- If the path exists with a conflicting `session_id` in its frontmatter, appends `-2`, `-3`, … until unique (REQ-ASM-039); logs `warn`.
- Frontmatter shape: `SessionLogFrontmatter` (§2.3). Body alternates `## user` / `## assistant` blocks; proposal decisions are appended as `## proposal` blocks.
- All write failures are caught and routed to `logger.error` with a redacted `sessionId` (NFR-ASM-005); callers do **not** await unless they need a durable audit row (only `appendProposalDecision` is awaited inline by `commitFileWriteProposal`).

---

## §7 — UI component contracts

Every component lives under `src/ui/components/` and is `<script setup>` per ADR-003. Selectors are exclusively `data-testid` (ADR-009).

### 7.1 `TransportStatusPill.vue`

**Path:** `src/ui/components/chat/TransportStatusPill.vue`
**Props:** `{ kind: TransportKind }` (required).
**Emits:** none.
**Render:** when `kind === 'subscription'`, renders `<span data-testid="chat-transport-status" role="status">{{ t('chat.subscription.statusPill') }}</span>`. Otherwise renders nothing (REQ-ASM-055 reuse posture).
**ARIA:** `role="status"`, `aria-live="polite"`.

### 7.2 `SubprocessStartingPill.vue`

**Path:** `src/ui/components/chat/SubprocessStartingPill.vue`
**Props:** `{ visible: boolean }` (required).
**Emits:** none.
**Render:** `v-if="visible"` → `<span data-testid="chat-subprocess-starting" role="status" aria-live="polite">{{ t('chat.subscription.starting') }}</span>`. Mounted ≥ 200 ms before the first `system/init` or `stream_event` (R-ASM-003 mitigation).
**Mutually-exclusive render states:** visible ↔ hidden.

### 7.3 `SessionResumeIndicator.vue`

**Path:** `src/ui/components/chat/SessionResumeIndicator.vue`
**Props:** `{ resumed: boolean }` (required).
**Emits:** none.
**Render:** `v-if="resumed"` → `<span data-testid="chat-session-resume" :aria-label="t('chat.subscription.resumeAriaLabel')"><span aria-hidden="true">↻</span></span>`.
**ARIA:** `aria-label` mirrors the i18n key; visual glyph is `aria-hidden`.

### 7.4 `FileWriteProposalCard.vue` — REQ-ASM-041, REQ-ASM-042, REQ-ASM-044, REQ-ASM-045, REQ-ASM-050

**Path:** `src/ui/components/chat/FileWriteProposalCard.vue`

**Props:**

| Prop | Type | Required | Semantics |
|---|---|---|---|
| `proposal` | `FileWriteProposal` | yes | The validated proposal DTO from the store. |
| `pathValidationError` | `PathValidationError \| null` | yes | When non-null, card renders in `'path-invalid'` state; Accept button is **not** rendered (REQ-ASM-048). |

**Emits:**

| Event | Payload | When |
|---|---|---|
| `accept` | `{ proposalId: string }` | Click / Enter / Space on Accept button. |
| `reject` | `{ proposalId: string }` | Click / Enter / Space on Reject button. |
| `retry` | `{ proposalId: string }` | Click / Enter / Space on Retry button. |

**Exposed refs (`defineExpose`):**

| Name | Type |
|---|---|
| `headingEl` | `Ref<HTMLElement \| null>` (heading element for programmatic focus on mount) |
| `acceptButtonEl` | `Ref<HTMLButtonElement \| null>` |
| `rejectButtonEl` | `Ref<HTMLButtonElement \| null>` |

**Render states** (mutually exclusive; first match wins):

| `proposal.status` × `pathValidationError` | State |
|---|---|
| any × non-null | `'path-invalid'` |
| `'pending'` × null | `'pending'` |
| `'accepted'` × null | `'accepted'` |
| `'rejected'` × null | `'rejected'` |
| `'failed'` × null | `'failed'` |

**Required `data-testid` attributes** (every interactive or assertable element):

| testid | Element | Visible in state |
|---|---|---|
| `proposal-card` | root `<section>` | all |
| `proposal-card-heading` | `<h3>` | all |
| `proposal-card-path` | `<code>` rendering `envelope.path` | all |
| `proposal-card-content-preview` | `<pre>` rendering first 40 lines of `envelope.content` | pending, accepted, rejected |
| `proposal-card-show-more` | toggle `<button>` | pending, accepted, rejected (when content > 40 lines) |
| `proposal-card-rationale` | `<p>` rendering `envelope.rationale` | pending, accepted, rejected (when defined) |
| `proposal-card-accept` | Accept `<button>` | pending only |
| `proposal-card-reject` | Reject `<button>` | pending only |
| `proposal-card-retry` | Retry `<button>` | pending, rejected, failed |
| `proposal-card-accepted-body` | `<p>` "Saved to '{path}'." | accepted |
| `proposal-card-rejected-body` | `<p>` "Discarded — no changes were made." | rejected |
| `proposal-card-failed-body` | `<p>` "Could not save the file. Please try again." | failed |
| `proposal-card-path-invalid` | `<p>` "That path isn't valid for this vault." | path-invalid |

**ARIA:**

- Root `<section role="region" :aria-label="t('chat.proposal.heading')">`.
- Accept button: `:aria-label="t('chat.proposal.acceptAriaLabel', { path: envelope.path })"`.
- Reject button: `:aria-label="t('chat.proposal.rejectAriaLabel', { path: envelope.path })"`.
- Retry button: `:aria-label="t('chat.proposal.retryAriaLabel', { path: envelope.path })"`.
- Card body is **not** a live region; the proposal lives at the user's reading pace.
- Heading is `tabindex="-1"` and receives programmatic focus on mount.

**Tab order** (NFR-ASM-007): heading → show-more → accept → reject → retry. The path and rationale are read-only and not in tab order.

**No `v-html` anywhere.** Content preview uses `textContent` (mounted via `<pre>{{ first40LinesOf(envelope.content) }}</pre>`).

### 7.5 `ClaudeCliPathField.vue`

**Path:** `src/ui/components/settings/ClaudeCliPathField.vue`

**Props:**

| Prop | Type | Required | Semantics |
|---|---|---|---|
| `modelValue` | `string` | yes | The current `claudeCliPath` value. |

**Emits:**

| Event | Payload | When |
|---|---|---|
| `update:modelValue` | `string` | On blur of the text input (trimmed). |
| `autodetect` | _(none)_ | Click on Autodetect button. |
| `test` | _(none)_ | Click on Test button. |

**Exposed refs:** `inputEl: Ref<HTMLInputElement \| null>`.

**`data-testid` attributes:**

- `settings-claude-cli-path-input`
- `settings-claude-cli-path-autodetect`
- `settings-claude-cli-path-test`
- `settings-claude-cli-path-description`
- `settings-claude-cli-path-status` (inline status line for autodetect/test results)

**ARIA:** input has `aria-describedby` referencing the description and status nodes; buttons have explicit `aria-label`s matching their label keys.

### 7.6 Extensions to `ChatSidebar.vue` — REQ-ASM-002, REQ-ASM-031, REQ-ASM-037, REQ-ASM-041

**New injected dependencies:**

| Key | Type |
|---|---|
| `CLAUDE_CLI_PORT` | `ClaudeCliPort \| undefined` (existing) |
| `CONFIRM_MODAL_PORT` | `ConfirmModalPort \| undefined` (NEW — §10.1) |
| `TRANSPORT_KIND_KEY` | `Ref<TransportKind>` (NEW — §10.1) |

**New local state:** `activeThreadId: Ref<string>` (UUID v4, generated on first send if absent).

**New render slots:**

- `<SubprocessStartingPill :visible="store.cliStartingUp" />`
- `<SessionResumeIndicator :resumed="store.sessionResumed" />`
- `<TransportStatusPill :kind="transportKind" />` rendered in the footer; absent when kind is `'api-key'`.

**Degraded branch addition** (template, evaluated top-to-bottom; preserves CCS order):

```
v-if="isMobile"                                → mobile degraded (REQ-CCS-020)
v-else-if="!availabilityChecked"               → empty (anti-flash)
v-else-if="kind === 'degraded' && apiKeyMissing && cliPathMissing"
                                               → no-key degraded (REQ-CCS-018)
v-else-if="kind === 'degraded' && !apiKeyMissing"
                                               → SDK-unavailable degraded (REQ-CCS-019)
v-else-if="kind === 'degraded' && apiKeyMissing && !cliPathMissing"
                                               → CLI-not-found degraded (REQ-ASM-009)
v-else                                         → ready state
```

The `degradedCli` block renders `<h3 data-testid="chat-degraded-heading" tabindex="-1">{{ t('chat.degradedCliHeading') }}</h3>`, body copy, and a `RouterLink` to Settings with `data-testid="chat-degraded-settings-link"`.

**New `handleAccept` / `handleReject` / `handleRetry` handlers** on `FileWriteProposalCard` `@accept` / `@reject` / `@retry` emits. `handleAccept` calls `commitFileWriteProposal` (§3.6); `handleReject` calls `rejectFileWriteProposal`; `handleRetry` re-issues the prior user turn via the same `handleSend` pathway (REQ-ASM-050).

**No mid-session transport switch:** `watch(settingsVersion, ...)` calls `selectTransport` only when `store.status !== 'loading'` (REQ-ASM-003).

### 7.7 Extensions to `ChatInput.vue`

Unchanged structurally. The `disabled` prop is now also true when `cliStartingUp === true` (the user cannot send while the subprocess is cold-starting). No new emits.

### 7.8 Extensions to `ChatResponse.vue` — REQ-ASM-025, REQ-ASM-041

**New `state` value:** `'structured-fail'`.

| `state` | Element | ARIA | Content |
|---|---|---|---|
| `structured-fail` | `<p data-testid="chat-response-structured-fail">` | `role="alert"` `aria-live="assertive"` | `t('chat.responseStructuredFail')` |

**New named slot `proposalCard`:** rendered after the assistant text (or in its place when the turn is a pure proposal). The parent passes a `FileWriteProposalCard` into this slot.

### 7.9 Extensions to `ContextFileList.vue`

Unchanged. The existing component continues to render the auto + manual chips. Stage preamble has no impact on this component.

---

## §8 — Pinia store extensions

### 8.1 `useChatStore` additions (extends CCS §4) — REQ-ASM-031, REQ-ASM-037, REQ-ASM-041

State additions (all `ref<T>`):

| Field | Type | Initial value | REQ |
|---|---|---|---|
| `chatThreads` | `Map<string, ChatThreadRecord>` | new empty `Map()` | REQ-ASM-037 |
| `activeThreadId` | `string \| null` | `null` | REQ-ASM-031 |
| `proposals` | `Map<string, FileWriteProposal>` | new empty `Map()` | REQ-ASM-041 |
| `streamingText` | `string` | `''` | NFR-ASM-002 |
| `cliStartingUp` | `boolean` | `false` | R-ASM-003 |
| `sessionResumed` | `boolean` | `false` | REQ-ASM-035 |

Action signatures (TypeScript):

```typescript
function upsertThread(record: ChatThreadRecord): void
function setActiveThreadId(threadId: string | null): void
function captureSessionId(threadId: string, sessionId: SessionId): void
function markThreadUsed(threadId: string): void
function appendStreamingDelta(delta: string): void
function resetStreaming(): void
function addProposal(proposal: FileWriteProposal): void
function setProposalStatus(
  proposalId: string,
  status: FileWriteProposalStatus,
  failureReason?: CommitProposalErrorCode,
): void
function setCliStartingUp(value: boolean): void
function setSessionResumed(value: boolean): void
```

All existing CCS actions and state fields are preserved (REQ-ASM-051…055 reuse posture).

### 8.2 `useFileProposalStore` — defer (Increment 2)

Not created in Increment 1. All proposal state lives on `useChatStore.proposals` per §8.1. A standalone store will be extracted in Increment 2 when edit / delete envelopes arrive and proposal lifecycle gains states beyond the current four.

---

## §9 — Plugin wiring (`src/plugin/main.ts`)

### 9.1 `onload()` additions

```typescript
// After existing `_claudeCliAdapter` instantiation:

// `child_process` is imported statically at the top of the file:
//   import { spawn } from 'child_process'
// so this constructor call has no dynamic-import in `onload()`.
this._subscriptionAdapter = new ClaudeSubprocessAdapter({
  getSettings: () => this.settings,
  logger: this.bridge,
  resolveCliPath: () => new ClaudeBinaryResolver(this.app).resolve(),
  spawn,
  now: () => Date.now(),
})
this.register(() => { this._subscriptionAdapter?.shutdown() })

this._confirmModalPort = new ObsidianConfirmModal(this.app)

this.registerView(VIEW_TYPE, (leaf) => {
  const view = new SpecoratorView(leaf, this, this._claudeCliAdapter!, {
    subscriptionAdapter: this._subscriptionAdapter!,
    confirmModalPort: this._confirmModalPort!,
    selectTransport: (settings) =>
      selectTransport(settings, {
        sdkAdapter: this._claudeCliAdapter!,
        subscriptionAdapter: this._subscriptionAdapter!,
        degradedPort: degradedClaudeCliPort,
        cliResolved: this._subscriptionAdapter!.isAvailableSync(),
      }),
  })
  this._specoratorView = view
  return view
})
```

`isAvailableSync()` is added on the subscription adapter as a synchronous getter on the same `_available` flag populated by `startup()`. It is **not** part of `ClaudeCliPort` — it lives on the adapter class directly for use by the selector.

### 9.2 `onLayoutReady` additions

```typescript
this.app.workspace.onLayoutReady(async () => {
  await Promise.all([
    this._claudeCliAdapter!.startup(),
    this._subscriptionAdapter!.startup(),
  ])
  // existing detectLegacyVaultLayout + onboarding flow unchanged
})
```

Both adapters start up unconditionally. `_subscriptionAdapter.startup()` is cheap when `claudeCliPath` is empty and autodetect fails (sets `_available = false` and returns without spawning).

### 9.3 Plugin data blob additions

```typescript
_storedData = {
  specorator: {
    ...PluginSettings,                            // includes new claudeCliPath, transportKind
    chatThreads: Record<string, ChatThreadRecord> // NEW — keyed by threadId
  },
  // ...existing module sub-keys unchanged...
}
```

The `chatThreads` map is read on plugin load and merged into `useChatStore.chatThreads` after the view mounts. Hydration is the responsibility of `SpecoratorView.onOpen()` (§9.5).

### 9.4 `onunload()`

Existing `detachLeavesOfType` + `bridge.hideAllNotices` + `core.destroy` sequence is preserved. The two `register(() => adapter.shutdown())` calls fire automatically.

### 9.5 `SpecoratorView.onOpen()` provisions

Existing CCS provisions preserved. New entries:

| Key constant | Value provided |
|---|---|
| `CLAUDE_CLI_PORT` | `selectTransport(settings).port` (REQ-ASM-001) |
| `TRANSPORT_KIND_KEY` | `ref(selectTransport(settings).kind)` (REQ-ASM-002) |
| `CONFIRM_MODAL_PORT` | `this._confirmModalPort` (REQ-ASM-044) |

`bumpSettingsVersion()` re-runs `selectTransport` and updates the provided refs **only when** `useChatStore().status !== 'loading'` (REQ-ASM-003).

### 9.6 URI handlers

No new URI actions in Increment 1. The existing `obsidian://specorator?action=open-chat` continues to work and resumes the last-active thread (REQ-ASM-037) via `SpecoratorView.onOpen()` hydration.

### 9.7 ESLint integration

`.eslintrc` extension is co-located with the plugin in `eslint-rules/no-claude-home-reads.js` (custom rule). Wiring: `plugins: ['local'], rules: { 'local/no-claude-home-reads': 'error' }`. Rule definition: §13.4.

---

## §10 — Settings tab additions

### 10.1 New InjectionKey symbols

```typescript
// src/infrastructure/bridge/ports.ts (extension)
import type { InjectionKey, Ref } from 'vue'
import type { ConfirmModalPort } from '@/domain/ports/ConfirmModalPort'
import type { TransportKind } from '@/domain/chat/TransportKind'

export const CONFIRM_MODAL_PORT: InjectionKey<ConfirmModalPort> = Symbol('ConfirmModalPort')
export const TRANSPORT_KIND_KEY: InjectionKey<Ref<TransportKind>> = Symbol('TransportKind')
```

### 10.2 `SpecoratorSettingTab.display()` additions

Below the existing `renderAnthropicKeyField()` call, add `renderClaudeCliPathField()`:

```typescript
private renderClaudeCliPathField(containerEl: HTMLElement): void {
  new Setting(containerEl)
    .setName(this.t('settings.claudeCliPath.label'))
    .setDesc(this.t('settings.claudeCliPath.description'))
    .addText((text) => {
      text.inputEl.dataset.testid = 'settings-claude-cli-path-input'
      text.setPlaceholder(this.t('settings.claudeCliPath.placeholder'))
      text.setValue(this.plugin.settings.claudeCliPath)
      text.onChange(async (raw) => {
        const trimmed = raw.trim()
        if (trimmed !== this.plugin.settings.claudeCliPath) {
          await this.plugin.updateSettings({ claudeCliPath: trimmed })
          this.plugin.specoratorView?.bumpSettingsVersion()
        }
      })
    })
    .addExtraButton((b) => {
      b.extraSettingsEl.dataset.testid = 'settings-claude-cli-path-autodetect'
      b.setIcon('search').setTooltip(this.t('settings.claudeCliPath.autodetect'))
      b.onClick(() => void this.handleAutodetect(containerEl))
    })
    .addExtraButton((b) => {
      b.extraSettingsEl.dataset.testid = 'settings-claude-cli-path-test'
      b.setIcon('check').setTooltip(this.t('settings.claudeCliPath.test'))
      b.onClick(() => void this.handleTestBinary(containerEl))
    })

  const desc = containerEl.createDiv({ cls: 'setting-item-description' })
  desc.dataset.testid = 'settings-claude-cli-path-description'
  desc.setText(this.t('settings.claudeCliPath.description'))
  // Renders the literal REQ-ASM-008 disclosure copy.

  const status = containerEl.createDiv({ cls: 'setting-item-description' })
  status.dataset.testid = 'settings-claude-cli-path-status'
  status.setText('')
}
```

`handleAutodetect` invokes `ClaudeBinaryResolver.resolve()`, updates the input value on success (REQ-ASM-004, REQ-ASM-005), and writes the i18n success/failure copy to the status node.

`handleTestBinary` spawns `<path> --version` via `child_process.spawnSync` (bounded to a 5-second timeout) and writes the version string verbatim into the status node on success, the failure copy on failure.

**Forbidden:** these handlers do **not** read any file under `~/.claude/`; the binary's own credential reads are out-of-scope (the user's tool acts as the user).

### 10.3 i18n keys

All keys verbatim per DESIGN-ASM-001 §B3. New namespaces: `chat.proposal.*`, `chat.subscription.*`, `chat.degradedCli*`, `chat.responseStructuredFail`, `settings.claudeCliPath.*`. Forbidden-terms test (`tests/ui/i18n/forbidden-terms.test.ts`) asserts none contain "subprocess", "OAuth", "session_id", "stream-json", "schema", "Zod", "envelope", "token", "API key", or "system prompt".

---

## §11 — Migration plan

### 11.1 `loadSettings-migrate.ts` additions

```typescript
export const PLUGIN_SETTINGS_KEYS: ReadonlyArray<keyof PluginSettings> = [
  'locale',
  'specsFolder',
  'archiveFolder',
  'decisionsFolder',
  'constitutionFile',
  'gateStrictness',
  'teamMode',
  'logLevel',
  'mcpServerEnabled',
  'anthropicApiKey',
  'claudeCliPath',     // NEW
  'transportKind',     // NEW
]
```

The existing `promoteLegacyFlatSettings` algorithm is unchanged; the two new keys are picked up automatically by the loop that copies known keys into the `specorator` sub-key.

### 11.2 Defaulting / coercion

New fields default via the existing `DEFAULT_SETTINGS` spread merge in `loadSettings()`. Coercion rules:

| Field | Stored value | Coerced to |
|---|---|---|
| `claudeCliPath` | non-string | `''` |
| `claudeCliPath` | string | `value.trim()` |
| `transportKind` | not in `{'auto','api-key','subscription','degraded'}` | `'auto'` |

Coercion runs inside the module's `validateSettings` hook (existing pattern); both fields are added to its switch.

### 11.3 Plugin data blob — `chatThreads` migration

New blob key under `_storedData.specorator.chatThreads`. Backward compatibility: missing key is treated as an empty record (no migration needed). When the key is present but a `ChatThreadRecord` is missing `sessionId`, `feature`, or `transport`, that record is filtered out at load time and logged at `warn`.

### 11.4 Tripwire updates

`tests/plugin/loadSettings-migrate.test.ts` gains two new assertions:

- Legacy blob with flat `claudeCliPath` and `transportKind` at the top level → promoted under `specorator`.
- Blob with `transportKind: 'auto'` already nested → unchanged (double-promotion guard).

---

## §12 — Testing scenarios

EARS-mapped acceptance scenarios. IDs use the `TEST-ASM-NNN` form. Format mirrors `SPEC-CCS-001` §15.

### 12.1 Transport selection — REQ-ASM-001…003

| ID | REQ | Scenario |
|---|---|---|
| TEST-ASM-001 | REQ-ASM-002 | Given `transportKind='auto'`, `anthropicApiKey='sk-...'`, `cliResolved=false` / When `selectTransport()` / Then result is `{ kind: 'api-key', port: sdkAdapter }`. |
| TEST-ASM-002 | REQ-ASM-002 | Given `transportKind='auto'`, `anthropicApiKey=''`, `cliResolved=true` / When `selectTransport()` / Then result is `{ kind: 'subscription', port: subscriptionAdapter }`. |
| TEST-ASM-003 | REQ-ASM-002 | Given `transportKind='auto'`, both unavailable / When `selectTransport()` / Then result is `{ kind: 'degraded' }`. |
| TEST-ASM-004 | REQ-ASM-003 | Given a thread in `status='loading'` / When `bumpSettingsVersion()` is called / Then `selectTransport()` is NOT re-invoked. |
| TEST-ASM-005 | REQ-ASM-001 | Static-import audit: `src/domain/ports/ClaudeCliPort.ts` has zero `obsidian` or `child_process` imports; both adapters declare `implements ClaudeCliPort`. |

### 12.2 Subprocess argv invariants — REQ-ASM-006, REQ-ASM-021, REQ-ASM-026, REQ-ASM-027, REQ-ASM-028, REQ-ASM-035

| ID | REQ | Scenario |
|---|---|---|
| TEST-ASM-006 | REQ-ASM-006 | For 100 random invocations of `buildSubprocessArgs` with arbitrary inputs / Then `'--bare'` is never present in the returned array. |
| TEST-ASM-007 | REQ-ASM-027 | Given `jsonSchema=null` / When `buildSubprocessArgs` runs / Then argv contains `'stream-json'`, `'--verbose'`, `'--include-partial-messages'` and does NOT contain `'--json-schema'`. |
| TEST-ASM-008 | REQ-ASM-021 | Given `jsonSchema='<schema>'` / Then argv contains `'json'`, `'--json-schema'`, the schema string. |
| TEST-ASM-009 | REQ-ASM-026 | Given `systemPromptSuffix` ending in 'Return only the JSON object — no commentary.' / Then argv carries that suffix as the value of `--append-system-prompt`. |
| TEST-ASM-010 | REQ-ASM-028 | Given any input / Then argv contains `'--permission-mode','dontAsk','--disallowedTools','Read,Edit,Write,Bash,Glob,Grep,WebFetch,WebSearch'`. |
| TEST-ASM-011 | REQ-ASM-035 | Given `resumeSessionId='abc-123'` / Then argv contains `'--resume','abc-123'`. Given `resumeSessionId=null` / Then `'--resume'` is absent. |

### 12.3 Adapter lifecycle and streaming — REQ-ASM-009, REQ-ASM-010, REQ-ASM-029, REQ-ASM-030, REQ-ASM-031, REQ-ASM-049

| ID | REQ | Scenario |
|---|---|---|
| TEST-ASM-012 | REQ-ASM-009 | Given `claudeCliPath` points to a non-existent file / When `startup()` resolves / Then `isAvailable()` returns `false` within 500 ms. |
| TEST-ASM-013 | REQ-ASM-010 | Given the same `threadId` across three `query()` calls / Then `spawn()` fires exactly once for streaming; subsequent calls reuse the cached `ChildProcess`. |
| TEST-ASM-014 | REQ-ASM-029 | Given stdout split mid-line across chunks / Then `_parseNdjson` reassembles via `readline` and dispatches events by `type`. |
| TEST-ASM-015 | REQ-ASM-030 | Given a `result` event with `is_error: true` / Then `query()` returns `Result.error` with `errorCode === 'QUERY_FAILED'`. Given exit code 1 with no result event / Then `errorCode === 'QUERY_FAILED'`. |
| TEST-ASM-016 | REQ-ASM-031 | Given `system/init` event with `session_id='xyz'` / Then `chatThread.sessionId === 'xyz'` after `query()` resolves. |
| TEST-ASM-017 | REQ-ASM-049 | Given a structured-proposal call after three free-text turns / Then `spawn()` fires a fresh process, exits cleanly after one `result` event, and does NOT enter `_streamingProc`. |

### 12.4 Stage-aware prompt — REQ-ASM-011…020

| ID | REQ | Scenario |
|---|---|---|
| TEST-ASM-018 | REQ-ASM-011 | Given active editor at `specs/foo/idea.md` / When `getActiveFeatureSlug` runs / Then returns `'foo'`. Given `README.md` / Then returns `null`. |
| TEST-ASM-019 | REQ-ASM-012 | Given pre-seeded `workflow-state.md` with valid YAML frontmatter / When `loadWorkflowStateSnapshot('foo', vault, logger, 'specs')` resolves / Then returns `{ feature: 'foo', stage: 'design', status: 'accepted' }`. |
| TEST-ASM-020 | REQ-ASM-013 | Given a snapshot / Then `assembleSystemPrompt` returns a string containing the slug, the stage display name, and the one-sentence description from `FEATURE_STEPS`. |
| TEST-ASM-021 | REQ-ASM-014 | Given snapshot is null / Then `assembleSystemPrompt` returns `''` and `--append-system-prompt` is omitted from argv. |
| TEST-ASM-022 | REQ-ASM-015 | Given malformed YAML in `workflow-state.md` / Then `loadWorkflowStateSnapshot` returns `null`, `logger.warn` is called exactly once, and no notification fires. |
| TEST-ASM-023 | REQ-ASM-016 | Given a workflow-state.md body containing the string "TopSecret" / Then the assembled preamble does not contain that string. |
| TEST-ASM-024 | REQ-ASM-019 | Given a stage advance between two sends / Then the second send's preamble reflects the new stage (no caching). |
| TEST-ASM-025 | REQ-ASM-020 | Given a stage description with 5 000 synthetic characters / Then assembled preamble length ≤ 2 000 chars and ends at a sentence boundary. |

### 12.5 Structured envelope parsing — REQ-ASM-021…030

| ID | REQ | Scenario |
|---|---|---|
| TEST-ASM-026 | REQ-ASM-022 | Snapshot test: `createFileEnvelopeJsonSchema` matches the stored byte-for-byte JSON Schema literal (key order normalised). |
| TEST-ASM-027 | REQ-ASM-023 | Given `.structured_output` with an extra unknown field `foo` / Then Zod rejects (`.strict()` / `additionalProperties: false`) and `parseStructuredEnvelope` returns `err(EnvelopeParseError{ kind: 'PRIMARY_ZOD_FAILED' })`. |
| TEST-ASM-028 | REQ-ASM-024 | Given `.structured_output` missing and `.result = 'Some preamble: {…valid envelope…} trailing'` with nested braces inside `content` / Then `extractFirstBalancedObject` returns the correct substring and Zod validates. |
| TEST-ASM-029 | REQ-ASM-025 | Given both primary parse and fallback fail / Then `parseStructuredEnvelope` returns `EnvelopeParseError` and the chat panel renders `chat-response-structured-fail` with no raw output quoted. |
| TEST-ASM-030 | REQ-ASM-048 | Given an envelope with `path='../escape.md'` / Then `validateProposalPath` returns `err(PathValidationError{ kind: 'CONTAINS_DOTDOT' })` and `FileWriteProposalCard` renders state `'path-invalid'` with no Accept button. |

### 12.6 Session persistence — REQ-ASM-031…040

| ID | REQ | Scenario |
|---|---|---|
| TEST-ASM-031 | REQ-ASM-032 | Given active feature `'foo'`, `sessionId='abc'`, `specsFolder='specs'` / Then `resolveSessionLogPath` returns `'specs/foo/sessions/abc.md'`. Given no feature / Then returns `'.specorator/sessions/abc.md'`. |
| TEST-ASM-032 | REQ-ASM-033 | After `appendUserAssistant` / Then the on-disk file parses as YAML frontmatter with `{session_id, feature, transport, created, updated}` and a `## user` / `## assistant` body. |
| TEST-ASM-033 | REQ-ASM-034 | Given a successful turn / Then `VaultPort.writeFile` is called once with appended content; the `updated` frontmatter timestamp is later than `created`. |
| TEST-ASM-034 | REQ-ASM-035 | Given a thread record with `sessionId='abc-123'` / Then the next subprocess invocation's argv contains `'--resume','abc-123'`. |
| TEST-ASM-035 | REQ-ASM-037 | Given a `MockBridge` restart with persisted `chatThreads` / Then `useChatStore.chatThreads` is rehydrated with all records and `activeThreadId` matches the last-used record. |
| TEST-ASM-036 | REQ-ASM-038 | Given the sessions folder does not exist / Then the first write calls `VaultPort.createFolder('specs/foo/sessions')` exactly once. |
| TEST-ASM-037 | REQ-ASM-039 | Given a pre-seeded session file with a conflicting `session_id` in frontmatter / Then the writer routes to `<id>-2.md` and logs `warn` exactly once. |
| TEST-ASM-038 | REQ-ASM-040 | Given a mocked `writeFile` that takes 1 000 ms / Then the chat UI render time after `handleSend` is not blocked on it (assertion: response is rendered within 100 ms of the in-memory `setResponse` call). |

### 12.7 Trust-first proposals — REQ-ASM-041…050, NFR-ASM-011

| ID | REQ | Scenario |
|---|---|---|
| TEST-ASM-039 | REQ-ASM-041 | Given a validated `CreateFileEnvelope` / Then `FileWriteProposalCard` renders `path`, the first 40 lines of `content`, the rationale, and the show-more affordance. |
| TEST-ASM-040 | REQ-ASM-042 | Given the card is mounted / Then Tab order is heading → show-more → accept → reject → retry; both Enter and Space activate Accept and Reject; `aria-label`s match REQ-ASM-042. |
| TEST-ASM-041 | REQ-ASM-043 | Given Accept is clicked / Then `VaultPort.writeFile(path, content)` is called exactly once with the envelope's validated values. |
| TEST-ASM-042 | REQ-ASM-044 | Given `fileExists(path) === true` / Then `ConfirmModalPort.show` is invoked; `writeFile` fires only when `show` resolves `true`. On `false`, `writeFile` is NOT called. |
| TEST-ASM-043 | REQ-ASM-045 | Given Reject is clicked / Then no `VaultPort` mutation method is called; the session log records `decision: 'rejected'`. |
| TEST-ASM-044 | REQ-ASM-046 | Given Accept or Reject / Then a `## proposal` block is appended to the session log with `{path, decision, decidedAt, rationale?}`. |
| TEST-ASM-045 | REQ-ASM-047 | Given `folderHint='specs/foo'` and `path='specs/foo/idea.md'` / Then `createFolder('specs/foo')` precedes `writeFile`. Given `folderHint='specs/bar'` and `path='specs/foo/idea.md'` / Then Zod refinement rejects at validation. |
| TEST-ASM-046 | REQ-ASM-050 | Given a rendered card / Then a Retry button is present and re-issues the prior user turn unchanged. |
| TEST-ASM-047 | NFR-ASM-011 | Integration: a structured-output proposal → validated → card rendered → Accept clicked → `VaultPort.writeFile` called once with exact validated values. No `writeFile` call originates from any other code path. |

### 12.8 Reused CCS requirements — REQ-ASM-051…055

| ID | REQ | Scenario |
|---|---|---|
| TEST-ASM-048 | REQ-ASM-054 | Given an active feature and a non-empty user message / Then the prompt passed to `query()` has the stage preamble first, then the CCS context preamble, then user text. |
| TEST-ASM-049 | REQ-ASM-055 | Given `kind='degraded'` and CLI missing / Then the `degradedCli` block renders with the heading "Chat needs the Claude command-line tool." and a Settings link. |

### 12.9 ToS posture and ESLint — REQ-ASM-007, REQ-ASM-036, NFR-ASM-004

| ID | REQ | Scenario |
|---|---|---|
| TEST-ASM-050 | REQ-ASM-007 | Custom ESLint rule `no-claude-home-reads` flags any literal containing `~/.claude/` or `.credentials.json` in `src/**`. |
| TEST-ASM-051 | REQ-ASM-036 | Integration test patches `fs.readFile` and asserts no production code path opens any path containing `.claude/` other than as an argv string passed to `spawn`. |
| TEST-ASM-052 | NFR-ASM-004 | Static grep across `src/**`: no string literal matches `/\.credentials\.json/` and the only `.claude/` references are inside test fixtures or argv assembly. |

---

## §13 — Release criteria

### 13.1 Verification gate

The following commands must pass on the feature branch before merge to `develop`:

```
npm audit --audit-level=high --omit=dev
npm run typecheck
npm run lint
npm run test
npm run build
npm run build:web
npm run docs:api
```

Coverage thresholds (statements/branches/functions/lines = 80/70/80/80) apply to the new application-layer and infrastructure modules introduced by this feature (CLAUDE.md test convention).

### 13.2 New ESLint rule: `no-claude-home-reads` — REQ-ASM-007, REQ-ASM-036, NFR-ASM-004

**Rule scope:**

- Applies to every file under `src/**` except `src/infrastructure/obsidian/buildSubprocessArgs.ts`, where the string `~/.claude/` may appear in test fixtures referenced by argv assembly (but not in production argv — the `claude` binary's own path is what is spawned, not anything under `~/.claude/`).
- Disallowed: any string literal (including template literals and JSDoc comment text) matching one of:
  - `/~\/\.claude\//` (literal Unix home / dot-claude)
  - `/\.credentials\.json/`
  - `/CLAUDE_CODE_OAUTH_TOKEN/`
  - `process.env.HOME + '/.claude'` (concatenation pattern)
  - `path.join(os.homedir?.(), '.claude'…)` (call expression pattern)
- Severity: `error`.
- Allow-list: `tests/**`, `inputs/**`, `docs/**`.

**Rule implementation file:** `eslint-rules/no-claude-home-reads.js` (Node CommonJS, `module.exports = { create(context) { /* … */ } }`).

### 13.3 ToS posture (verbatim, NFR-ASM-004)

The plugin code does **not** read `~/.claude/.credentials.json` or any file under `~/.claude/`. This is enforced by:

1. The `no-claude-home-reads` ESLint rule (§13.2).
2. The integration test `tests/integration/no-claude-home.test.ts` (TEST-ASM-051) that monitors `fs` reads at runtime.
3. The `ClaudeSubprocessAdapter` class JSDoc (§4) restates the posture as a hard invariant on the adapter.

Spawning the user's own `claude` binary does **not** count as a plugin read of `~/.claude/` — the binary runs as the user, reads its own credentials as the user, and the plugin neither observes nor intercepts those reads.

### 13.4 Release blockers (any unresolved fails this stage)

| Blocker | Resolution |
|---|---|
| `--bare` appears anywhere in subprocess argv | Fix `buildSubprocessArgs`; re-run TEST-ASM-006. |
| Any vault write fires without a preceding Accept click | Audit the call site; only `commitFileWriteProposal` may invoke `VaultPort.writeFile` from a model proposal. |
| `STRUCTURED_PARSE_FAILED` surfaces raw model output to the user | Remove the leak; assert via TEST-ASM-029. |
| Session log writes are awaited on the chat-send critical path | Inline `await` is allowed only in `commitFileWriteProposal` for the audit row; otherwise fire-and-forget. |
| Forbidden i18n term present in user-visible copy (NFR-ASM-009) | Replace with allowed copy. |

---

## §14 — Requirements coverage

Every PRD requirement and NFR is covered by at least one section above. 67 / 67.

### 14.1 Functional requirements — REQ-ASM-001 through REQ-ASM-055

| REQ | Spec sections | Tests |
|---|---|---|
| REQ-ASM-001 | §2.1, §2.6, §6.1, §9.5 | TEST-ASM-005 |
| REQ-ASM-002 | §2.1, §3.1, §9.5 | TEST-ASM-001, 002, 003 |
| REQ-ASM-003 | §3.1, §7.6, §9.5 | TEST-ASM-004 |
| REQ-ASM-004 | §2.12, §10.2 | (§10.2 settings UI test) |
| REQ-ASM-005 | §10.2 | (§10.2 settings UI test) |
| REQ-ASM-006 | §3.7 INV-1, §4.5 | TEST-ASM-006 |
| REQ-ASM-007 | §4, §13.2, §13.3 | TEST-ASM-050, 052 |
| REQ-ASM-008 | §10.2, §10.3 | (§10.3 i18n snapshot) |
| REQ-ASM-009 | §2.7, §4.2, §7.6 | TEST-ASM-012 |
| REQ-ASM-010 | §4.5, §4.2 | TEST-ASM-013 |
| REQ-ASM-011 | §6.2 (`getActiveFeatureSlug`) | TEST-ASM-018 |
| REQ-ASM-012 | §6.2 (`loadWorkflowStateSnapshot`) | TEST-ASM-019 |
| REQ-ASM-013 | §3.2, §6.2 | TEST-ASM-020 |
| REQ-ASM-014 | §3.2 step 1, §3.7 INV-6 | TEST-ASM-021 |
| REQ-ASM-015 | §6.2, §3.2 step 3 | TEST-ASM-022 |
| REQ-ASM-016 | §3.2 step 4 | TEST-ASM-023 |
| REQ-ASM-017 | §2.11, §6.2 | (TEST-ASM-020 covers via FEATURE_STEPS source) |
| REQ-ASM-018 | §2.6, §3.2 (transport-agnostic), §6 | (TEST-ASM-020 across both adapters) |
| REQ-ASM-019 | §3.2 (recomputed every send) | TEST-ASM-024 |
| REQ-ASM-020 | §3.2 steps 5–7 | TEST-ASM-025 |
| REQ-ASM-021 | §2.4, §3.7 INV-4, §6.6 | TEST-ASM-008 |
| REQ-ASM-022 | §2.4 (Zod), §6.3 | TEST-ASM-026 |
| REQ-ASM-023 | §3.3 step 1, §6.3 | TEST-ASM-027 |
| REQ-ASM-024 | §3.3 steps 2–4, §6.3 | TEST-ASM-028 |
| REQ-ASM-025 | §2.7, §3.3 (failure), §7.8 | TEST-ASM-029 |
| REQ-ASM-026 | §3.2 step 4, §3.7 INV-6 | TEST-ASM-009 |
| REQ-ASM-027 | §3.7 INV-3 | TEST-ASM-007 |
| REQ-ASM-028 | §3.7 INV-2 | TEST-ASM-010 |
| REQ-ASM-029 | §4.3 `_parseNdjson` | TEST-ASM-014 |
| REQ-ASM-030 | §4.4 mapping | TEST-ASM-015 |
| REQ-ASM-031 | §2.2, §4.3 `_captureSessionId`, §8.1 | TEST-ASM-016 |
| REQ-ASM-032 | §6.7 `resolveSessionLogPath` | TEST-ASM-031 |
| REQ-ASM-033 | §2.3, §6.7 | TEST-ASM-032 |
| REQ-ASM-034 | §6.7 `appendUserAssistant` | TEST-ASM-033 |
| REQ-ASM-035 | §2.6, §3.7 INV-5, §4.5 | TEST-ASM-034, 011 |
| REQ-ASM-036 | §4 JSDoc, §13.3 | TEST-ASM-051 |
| REQ-ASM-037 | §2.2, §8.1, §9.3, §9.5 | TEST-ASM-035 |
| REQ-ASM-038 | §6.7 (ensure folder) | TEST-ASM-036 |
| REQ-ASM-039 | §6.7 (overwrite suffix) | TEST-ASM-037 |
| REQ-ASM-040 | §6.7 (fire-and-forget, per-log mutex) | TEST-ASM-038 |
| REQ-ASM-041 | §2.5, §3.5, §7.4 | TEST-ASM-039 |
| REQ-ASM-042 | §7.4 (a11y, data-testid) | TEST-ASM-040 |
| REQ-ASM-043 | §3.6 step 3 | TEST-ASM-041, 047 |
| REQ-ASM-044 | §2.10, §3.6 step 1 | TEST-ASM-042 |
| REQ-ASM-045 | §3.6 (reject branch) | TEST-ASM-043 |
| REQ-ASM-046 | §6.7 `appendProposalDecision` | TEST-ASM-044 |
| REQ-ASM-047 | §2.4 refinement, §3.6 step 2 | TEST-ASM-045 |
| REQ-ASM-048 | §3.4, §7.4 (path-invalid state) | TEST-ASM-030 |
| REQ-ASM-049 | §4.5 (short-lived per call) | TEST-ASM-017 |
| REQ-ASM-050 | §7.4 (Retry button), §7.6 (`handleRetry`) | TEST-ASM-046 |
| REQ-ASM-051 | §1.3 reuse (CCS `setActiveFile`) | (CCS TEST-CCS-STORE-001 inherited) |
| REQ-ASM-052 | §1.3 reuse (CCS `setActiveFile(null)`) | (CCS TEST-CCS-STORE-002 inherited) |
| REQ-ASM-053 | §1.3 reuse (CCS file-menu) | (CCS TEST-CCS-INT-005 inherited) |
| REQ-ASM-054 | §3.2 concatenation order | TEST-ASM-048 |
| REQ-ASM-055 | §7.6 degraded branches, §2.7 error codes | TEST-ASM-049 |

### 14.2 Non-functional requirements — NFR-ASM-001 through NFR-ASM-012

| NFR | Spec sections | Tests |
|---|---|---|
| NFR-ASM-001 | §4.5 (long-lived process amortises spawn), §7.2 (starting pill) | TEST-ASM-013 |
| NFR-ASM-002 | §4.3 `readline`, §6.7 fire-and-forget | TEST-ASM-038 |
| NFR-ASM-003 | §3.2 (pure sync function) | (TEST-ASM-024 timing) |
| NFR-ASM-004 | §4 JSDoc, §13.2 ESLint rule, §13.3 | TEST-ASM-050, 051, 052 |
| NFR-ASM-005 | §4.4 logging discipline, §6.7 redaction | (Log-redaction unit test under tests/infrastructure) |
| NFR-ASM-006 | §4.2 `startup`, §7.6 degraded branch | TEST-ASM-012 |
| NFR-ASM-007 | §7.4 tab order and aria | TEST-ASM-040 |
| NFR-ASM-008 | §7.8 `aria-live="polite"`, debounced batching | (Component-level a11y test) |
| NFR-ASM-009 | §10.3 forbidden-terms test | (TEST in `tests/ui/i18n/forbidden-terms.test.ts`) |
| NFR-ASM-010 | §10.2 platform-specific autodetect | (Platform-stub unit test) |
| NFR-ASM-011 | §3.6 verbatim invariant, §6.5 | TEST-ASM-047 |
| NFR-ASM-012 | §4.4 LoggerPort.debug shape | (Telemetry shape unit test) |

### 14.3 Coverage summary

**Total contracts traced:** 55 functional REQ-ASM + 12 NFR-ASM = **67 / 67**. No requirement is unaddressed. No spec section is unreferenced.

---

## Quality gate

- [x] Every interface specifies a TypeScript signature compilable without `any`.
- [x] Every algorithm pseudocode is deterministic and one-input-one-branch.
- [x] Every UI component lists `data-testid` attributes for every interactive element (per ADR-009).
- [x] Every fallible operation returns `Result<T, E>` (ADR-004).
- [x] `commitFileWriteProposal` is the sole vault-mutation path from a model proposal (NFR-ASM-011).
- [x] No code path reads `~/.claude/.credentials.json` or any file under `~/.claude/` (NFR-ASM-004; enforced by ESLint rule `no-claude-home-reads` in §13.2).
- [x] Every PRD requirement (REQ-ASM-001…055) and NFR (NFR-ASM-001…012) is covered (§14, 67/67).
- [x] All four ADRs (0029, 0030, 0031, 0032) are realised: transport split (§2.1/§4/§6.1), structured output (§2.4/§3.3/§6.6), session persistence (§2.2/§6.7), trust-first proposals (§3.6/§7.4).
