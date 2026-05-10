# Research — Obsidian official CLI as MCP vault tool backend

**Issue:** #203
**Date:** 2026-05-10
**Decision status:** Recorded
**Affects:** #184 (parent), #190 (vault + frontmatter tools), #193 (links/canvas/bases tools)

## TL;DR

**Do not delegate any MCP tool to the official `obsidian` CLI.** Implement every tool in-process via `VaultPort` and the existing narrow ports. For `vault_move_note`, extend `VaultPort` with a `moveFile(from, to)` method backed by `app.fileManager.renameFile()` — Obsidian's official supported API, which rewrites all wikilinks atomically. Do not depend on `obsidian-cli-rest`. Do not expose `vault_eval`.

## Decision matrix

| Tool | Backend | Reason |
|---|---|---|
| `vault_move_note` | `app.fileManager.renameFile()` via extended `VaultPort.moveFile` | Atomic backlink rewrite. Native API. Already accessible from `ObsidianBridge` (line 53 already uses `app.fileManager`). |
| `vault_search` | `VaultPort` + native `app.vault.cachedRead` / `MetadataCachePort` | In-process; CLI shell-out adds 100–500 ms per call — unacceptable for chat sidebar. Native search via `app.metadataCache` is sufficient. |
| `vault_write_note` / `vault_append_to_note` | `VaultPort` (existing) → proposal queue (#191) | Plugin hooks already fire via `app.vault.create` / `app.vault.modify`. CLI adds nothing. |
| `links_resolve` | `MetadataCachePort.getFirstLinkpathDest()` | In-process. No CLI advantage. |
| `metadata_get_*` | `MetadataCachePort` | In-process. No CLI advantage. |
| `vault_eval` (proposed) | **Not exposed** | Arbitrary JS execution = critical security surface. Out of scope for v1. |

## Answers to research questions

### 1. Can `VaultPort` be extended to call `app.fileManager.renameFile()` natively?

**Yes.** `app.fileManager` is already accessed in `ObsidianBridge` (`src/infrastructure/obsidian/ObsidianBridge.ts:53` for `trashFile`). `renameFile(file, newPath)` is the documented Obsidian API for move/rename and **rewrites all wikilinks atomically**. This makes the CLI unnecessary for `vault_move_note`.

**Implementation:**

```ts
// src/domain/ports/VaultPort.ts
export interface VaultPort {
  // ...existing methods...
  moveFile(from: string, to: string): Promise<void>
}

// ObsidianBridge.moveFile
async moveFile(from: string, to: string): Promise<void> {
  const file = this.app.vault.getAbstractFileByPath(from)
  if (!(file instanceof TFile)) throw new Error(`File not found: ${from}`)
  await this.app.fileManager.renameFile(file, to)
}

// MockBridge.moveFile — update path key + scan content for wikilinks pointing to `from`,
// rewrite to `to` (mirrors Obsidian semantics for tests).

// LocalStorageBridge.moveFile — same key-rename + wikilink rewrite in stored content.
```

`MockBridge` and `LocalStorageBridge` must replicate the wikilink-rewrite contract so unit tests verifying backlink integrity behave the same in all three implementations.

### 2. Is `child_process` viable from the Obsidian renderer?

Technically yes — Obsidian disables `contextIsolation`, so plugin code has Node.js access in the renderer. But practically:

- **Binary path resolution is fragile.** No reliable way to locate the user's `obsidian` binary across Windows / macOS (App Store, DMG, Homebrew) / Linux (AppImage, Flatpak, Snap). Each install method places the executable differently.
- **Process spawn cost.** Cold-start of the CLI is 100–500 ms. Multiplied across a multi-tool agent turn, this turns the sidebar from interactive into laggy.
- **Permissions surface.** Spawning external processes from a plugin invites antivirus / endpoint-protection false positives, especially on Windows.
- **Self-call cycle.** The CLI talks to the *running* Obsidian process — the same process the plugin is already inside. We'd shell out only to come back through IPC. Direct `app.*` calls skip both hops.

Conclusion: even though it works, it is the wrong tool. In-process port calls are strictly better.

### 3. Is `obsidian-cli-rest` a viable proxy?

**No.** Reasons:

- Early-stage project (small contributor base, no v1 release).
- Adds plugin-on-plugin dependency: users must install and configure a second plugin for Specorator to function. Doubles the install friction documented in REQ-0003 (community plugin awareness).
- HTTP loopback round-trip per tool call. Slower than CLI shell-out (which it wraps) and slower than direct port calls by 2–3 orders of magnitude.
- No leverage gained: Specorator's MCP server runs *inside* the plugin and already has direct access to every API the proxy exposes.

If the upstream project matures and adds endpoints we cannot replicate (unlikely — we have full `app.*` access), revisit. Until then, ignore.

### 4. What is the security posture of `obsidian eval` as an MCP tool?

`obsidian eval` runs arbitrary JavaScript in the Obsidian process. Exposing it as an MCP tool means any agent that can call `vault_eval` has full code execution against the user's vault, plugin state, and Obsidian internals.

**Decision: do not expose.** Not in v1, not behind a flag, not as a separate `vm-tools` group. The accept/reject proposal flow does not meaningfully constrain a payload that is "execute this string" — the user cannot review JavaScript safety in a sidebar card.

If a v2.0 use case demands it (e.g., a power-user advanced mode), it must require:

1. Explicit per-vault opt-in stored encrypted in settings.
2. Per-call user approval that displays the full source.
3. Distinct tool group with separate enable flag.
4. ADR documenting the threat model.

None of this is in scope for v1.

### 5. Performance delta — does CLI break interactive feel?

Yes, decisively.

| Path | Latency per call (warm) | Notes |
|---|---|---|
| Direct `VaultPort` (in-process) | < 1 ms | Just Vault API access |
| `MetadataCachePort` lookup | < 1 ms | In-memory cache |
| Shell-out to `obsidian` CLI | 100–500 ms | Process spawn + Obsidian IPC |
| `obsidian-cli-rest` HTTP loopback | 200–600 ms | CLI cost + HTTP framing |

A multi-step agent turn calling 5–10 tools through CLI = 1–5 s of pure overhead. Through in-process ports = unmeasurable. The chat sidebar UX requirement (#161) cannot tolerate the CLI path.

## Implementation directives

1. **#190 — `vault_move_note`:** extend `VaultPort` with `moveFile(from, to)`, back it with `app.fileManager.renameFile()` in `ObsidianBridge`, replicate wikilink-rewrite semantics in `MockBridge` and `LocalStorageBridge`. Tool returns `{ proposalId, status: 'pending' }` per write-tool contract; on user accept, the queue calls `VaultPort.moveFile`.
2. **Integration test:** acceptance criterion of #190 must include a test that creates note A linking to `[[B]]`, calls `vault_move_note('B.md', 'C.md')`, accepts the proposal, and asserts A now contains `[[C]]`. Run against `MockBridge` (unit) and verify behaviour parity with `ObsidianBridge` in a manual smoke test (Obsidian's `renameFile` is the authoritative oracle).
3. **#193 — `links_resolve`:** delegate to `MetadataCachePort.getFirstLinkpathDest()`. No CLI.
4. **No new dependencies.** Do not add `obsidian-cli-rest` to community plugin recommendations.
5. **No `vault_eval` tool.** Add a comment in #184 closing this off explicitly so v2.0 work re-opens with a fresh threat-model review.

## Risks and follow-ups

- **Risk:** `app.fileManager.renameFile()` is part of Obsidian's documented but not strictly versioned API. If Obsidian changes its signature in a future major version, the move tool breaks. Mitigation: pin minimum Obsidian version in `manifest.json`; track via release notes.
- **Follow-up:** if a power-user requests `vault_eval` post-v1, file a separate requirements intake — do not bolt it onto the MCP server quietly.
- **Follow-up:** when #200 (URI dispatch) and the chat module ship, revisit whether any CLI-only command (e.g., `obsidian sync`) becomes a Specorator surface — it remains out of scope for the agent tool surface, but may be a settings-page action.

## References

- #184 — parent (MCP server)
- #190 — vault + frontmatter tools (consumes this decision)
- #193 — links / canvas / bases tools
- #165 — full tool surface requirement
- `src/infrastructure/obsidian/ObsidianBridge.ts:53` — existing `app.fileManager` access
- `src/domain/ports/VaultPort.ts` — port to extend
- Obsidian API: `app.fileManager.renameFile(file, newPath)` — atomic backlink rewrite
- [obsidian-cli-rest](https://github.com/dsebastien/obsidian-cli-rest) — evaluated, rejected
