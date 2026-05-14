---
id: ADR-0031
title: Persist `session_id` in plugin data and mirror the conversation to a vault-local session log; never read `~/.claude/`
status: accepted
date: 2026-05-14
deciders:
  - architect
consulted:
  - pm
  - analyst
informed:
  - dev
supersedes: []
superseded-by: []
tags: [chat, session, persistence, agent-sidepanel-mvp, tos, security]
---

# ADR-0031 — Persist `session_id` in plugin data and mirror the conversation to a vault-local session log; never read `~/.claude/`

## Status

Accepted

## Context

The Agent Sidepanel MVP must give subscription users a chat that survives Obsidian
restart (IDEA-ASM-001 success criterion). The `claude` CLI's `stream-json` framing
emits a `system/init` event carrying a per-session UUID (`session_id`); subsequent
calls with `--resume <id>` continue that session (RES-ASM-001 §F1, §F5).

Three separate persistence questions arise:

1. **Where is `session_id` stored?** The plugin must retrieve it on Obsidian restart
   so chat threads can continue.
2. **Where is the per-thread conversation persisted?** REQ-ASM-033, REQ-ASM-034.
3. **Is the CLI's own NDJSON log under `~/.claude/projects/...` read or duplicated?**

The third question is a ToS posture question, not a convenience question. RES-ASM-001
§F6 states the policy explicitly: the plugin must not read, copy, transmit, or persist
`~/.claude/.credentials.json`, any OAuth token, or — by extension of the same
principle — any other file under `~/.claude/` that is not part of the user's own
invocation of the `claude` binary. The CLI's per-project JSONL files belong to the
CLI's own session store and are not part of the plugin's surface.

Four placement strategies were evaluated for the per-thread conversation log:

1. **Inside the plugin data blob.** Conversation lives in `_storedData.specorator.chatThreads`.
   Synced if the user has Obsidian Sync on the data blob, but **invisible in the vault**
   — the user cannot grep, link, or version-control it.
2. **In a top-level `.specorator/sessions/` vault folder.** Vault-local, Sync-portable
   (REQ-CCS-028), but pollutes the vault root with a hidden folder that is not part
   of the user's content.
3. **Inside `specs/<feature>/sessions/<id>.md` when a feature is active, falling back
   to `.specorator/sessions/<id>.md` otherwise.** Vault-local, Sync-portable, and
   co-located with the feature the chat belongs to.
4. **Mirror the CLI's own NDJSON under `~/.claude/projects/...`.** Reuse the CLI's
   work — but this requires the plugin to read files under `~/.claude/`, which the
   ToS posture forbids.

For `session_id` placement (question 1), the choices are simpler: either inside the
plugin data blob (per-device, opaque to the vault) or inside the session-log frontmatter
(vault-portable but the plugin must scan the sessions folder to rehydrate). The data
blob's per-device persistence aligns with the per-device nature of the
`claude` binary's local OAuth credentials and is the natural place for a runtime
identifier.

## Decision

The plugin uses a two-layer persistence model with strict ToS isolation:

**Layer 1 — `session_id` and chat-thread metadata.** Stored in the plugin data blob
under `_storedData.specorator.chatThreads`. Each entry is a `ChatThreadRecord`:

```ts
interface ChatThreadRecord {
  readonly threadId: string         // plugin-generated UUID
  readonly sessionId: string | null // CLI's session_id; null until system/init fires
  readonly feature: string | null   // active feature slug at thread creation; null = no feature
  readonly logPath: string          // vault-relative path of the session log
  readonly transport: 'api-key' | 'subscription'
  readonly createdAt: string        // ISO 8601 UTC
  readonly lastUsedAt: string       // ISO 8601 UTC
}
```

This blob is opaque to the vault. It is per-device by default (subject to Obsidian
Sync on the data blob if the user has it enabled, mirroring REQ-CCS-028).

**Layer 2 — Conversation log.** The per-thread chat history is mirrored to a vault-
local markdown file at `specs/<active-feature>/sessions/<session-id>.md` when an active
feature is known (REQ-ASM-032), with a deterministic fallback to
`.specorator/sessions/<session-id>.md` when no feature is active. The log is markdown
with YAML frontmatter (REQ-ASM-033):

```markdown
---
session_id: <uuid>
feature: <slug | null>
transport: subscription | api-key
created: <ISO 8601>
updated: <ISO 8601>
---

## user
<user text>

## assistant
<assistant text>

## proposal
- path: <path>
- decision: accepted | rejected
- decided_at: <ISO 8601>
- rationale: <optional>
```

The log is **append-only** during a thread's lifetime. Each turn appends a `## user` /
`## assistant` block (REQ-ASM-034). Each proposal-card decision appends a `## proposal`
block (REQ-ASM-046). Writes are fire-and-forget so the chat UI is never blocked on disk
I/O (REQ-ASM-040). Overwrite protection: if a target path already exists with a
different `session_id` in its frontmatter (REQ-ASM-039), the writer appends a `-2`,
`-3`, … suffix and logs a warning rather than clobbering.

**Strict ToS isolation.** The plugin must never:

- open, read, copy, transmit, persist, or watch `~/.claude/.credentials.json` or any
  file derived from it (REQ-ASM-007);
- open, read, copy, parse, or duplicate any file under `~/.claude/projects/*.jsonl`
  or `~/.claude/history.jsonl` or any other file under `~/.claude/` except as part of
  the user's own invocation of the `claude` binary (REQ-ASM-036);
- prompt for or accept an OAuth token (e.g. `CLAUDE_CODE_OAUTH_TOKEN`) as a Settings
  field (REQ-ASM-007);
- market itself as offering Claude.ai login (REQ-ASM-008 disclosure copy).

If the plugin needs prior conversation context, it reconstructs it from its own
session log only. The CLI's per-project NDJSON files are out of scope and out of bounds.

## Considered options

### Option A — Data blob only, no vault mirror

- Pros: zero vault writes; no path-resolution edge cases; no Sync portability concern
  beyond the data blob.
- Cons: conversation log is invisible in the vault — the user cannot grep, backlink,
  or version-control it; lost on plugin uninstall; not aligned with the Specorator
  workflow's "specs are source of truth" principle.

### Option B — Vault `.specorator/sessions/` only

- Pros: vault-local, Sync-portable.
- Cons: pollutes vault root with a folder unrelated to the user's content; not
  co-located with the feature the chat is about; the `session_id` rehydration path
  requires scanning the folder on plugin load.

### Option C — `specs/<feature>/sessions/<id>.md` with `.specorator/` fallback, plus data-blob `session_id` (chosen)

- Pros: co-located with the feature; vault-local; Sync-portable; data-blob `session_id`
  is opaque and per-device by default; deterministic fallback when no feature is
  active; respects ADR-005 vault structure (sessions folder is a per-feature subfolder
  the same way other artifact folders are).
- Cons: two storage locations (data blob + vault file) must agree on `session_id`;
  the relationship is maintained by writing `session_id` into the frontmatter so the
  log is self-describing.

### Option D — Mirror the CLI's `~/.claude/projects/...` NDJSON

- Pros: zero plugin-side write code; reuse Anthropic's work.
- Cons: **violates ToS posture (RES-ASM-001 §F6).** The plugin must not read files
  under `~/.claude/`. Rejected on principle.

## Consequences

### Positive

- **Survives Obsidian restart.** `session_id` is persisted in plugin data; the next
  spawn call passes `--resume <id>` and the CLI continues the session (REQ-ASM-035,
  REQ-ASM-037).
- **Vault-portable.** The session log is plain markdown with YAML frontmatter; the
  user can read it, grep it, link to it, version-control it, and sync it via Obsidian
  Sync without the plugin's involvement (REQ-CCS-028).
- **Co-located with the feature.** A chat thread about feature `foo` writes to
  `specs/foo/sessions/<id>.md`, which is the same folder as `idea.md`, `requirements.md`,
  etc. Cross-references are straightforward.
- **ToS-safe by construction.** No code path opens any file under `~/.claude/`. An
  ESLint rule and an integration test enforce this; the safe pattern is the only
  pattern (REQ-ASM-007, REQ-ASM-036, NFR-ASM-004).
- **Audit trail for trust-first writes.** Every proposal decision lands in the session
  log (REQ-ASM-046), giving the user a complete record of what the assistant proposed
  and what they accepted.

### Negative

- **Two storage locations to keep in sync.** The data blob holds the `session_id`;
  the vault file's frontmatter mirrors it. If the file is moved or deleted out-of-band,
  the data blob may point to a missing file. Mitigated by treating a missing log as a
  fresh-thread condition — the next `system/init` event generates a new file and the
  data blob is updated.
- **Sessions folder is created on demand.** First write in a feature triggers a
  `VaultPort.createFolder` call (REQ-ASM-038). Folder creation is idempotent.
- **`.specorator/` vault-root pollution in the fallback case.** When no feature is
  active, the fallback writes to `.specorator/sessions/`. The leading dot makes it
  unobtrusive in most Obsidian themes; user-visible nonetheless. Documented in the
  Settings tab as a known fallback path. (R-ASM-005 mitigation.)
- **Write contention.** If the user types fast enough to trigger overlapping
  fire-and-forget writes, they could interleave. Mitigated by serialising writes per
  log file through a per-thread mutex inside the session-log writer service.
- **Existing-log relocation.** If a future increment moves the session-log root
  (e.g. to a user-configurable `.specorator/chats/` setting — Increment 2), already
  written `specs/<feature>/sessions/<id>.md` files would need a one-time migration
  or be left in place as historical artifacts. Increment 1 ships only the canonical
  paths, so the question does not arise yet, but Increment-2 readers should plan
  for a no-op migration when the existing path is the default.

### Neutral

- The CLI itself still writes its own NDJSON under `~/.claude/projects/...` whenever
  it is invoked. That is the CLI's behaviour, not the plugin's. The plugin neither
  prevents nor consumes those files.
- A future setting to relocate the session log root (e.g. `.specorator/chats/` or a
  user-chosen folder) would supersede this ADR's path-resolution rules but not its
  ToS-isolation rules.

## Compliance

- `src/application/chat/sessionLogPath.ts` exports `resolveSessionLogPath(feature,
  sessionId)` returning the canonical vault-relative path; unit tested for both
  branches (REQ-ASM-032 acceptance).
- `src/application/chat/SessionLogWriter.ts` exports the writer; it depends only on
  `VaultPort`, `LoggerPort`, and the canonical path resolver. Per-log-file mutex is
  internal to the writer.
- A custom ESLint rule (`no-claude-home-reads`) fails any string literal matching
  `~/.claude/` or `.credentials.json` outside the subprocess adapter's argv-building
  scope, where neither pattern is permitted (REQ-ASM-007, NFR-ASM-004).
- An integration test under `tests/integration/no-claude-home.test.ts` patches `fs`
  and asserts that no production code path opens any path containing `.claude/` other
  than as an argv string passed to `spawn` (which is the user's own invocation, not a
  plugin read).
- The Settings tab description for the "Claude CLI path" field renders the literal
  disclosure copy from REQ-ASM-008 ("Specorator does not handle your Claude.ai
  credentials. The `claude` CLI you installed manages its own login.").
- A render test for the session-log writer asserts the frontmatter contains
  `session_id`, `feature`, `transport`, `created`, `updated` and that the body
  alternates `## user` / `## assistant` / `## proposal` blocks (REQ-ASM-033, REQ-ASM-046).
- An integration test pre-seeds a session log with a conflicting `session_id` in
  frontmatter and asserts the new write goes to `<id>-2.md` with a warn-level log
  (REQ-ASM-039).

## References

- IDEA-ASM-001 — Constraints (Anthropic ToS; trust-first audit); Success criteria
  (survives Obsidian restart).
- PRD-ASM-001 — REQ-ASM-007, REQ-ASM-008, REQ-ASM-031, REQ-ASM-032, REQ-ASM-033,
  REQ-ASM-034, REQ-ASM-035, REQ-ASM-036, REQ-ASM-037, REQ-ASM-038, REQ-ASM-039,
  REQ-ASM-040, REQ-ASM-046; NFR-ASM-004, NFR-ASM-005.
- RES-ASM-001 — D-ASM-005, D-ASM-009; F1 (CLI reference), F5 (Session persistence),
  F6 (ToS posture); R-ASM-001 (ToS interpretation risk), R-ASM-005 (fallback path).
- ADR-005 — Agentic-workflow vault structure (sessions folder is a per-feature
  subfolder).
- ADR-008 — Narrow ports (`VaultPort` is the only vault-write surface).
- ADR-0028 — API-key field placement (data blob persistence pattern).
- ADR-0029 — Transport split (subprocess adapter is the only consumer of `--resume`).
- [Anthropic support 11145838 — Claude Code with Pro/Max](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
- [Anthropic support 15036540 — Use the Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only
> the predecessor's `status` and `superseded-by` pointer fields may be updated.
