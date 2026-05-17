# WP-5 — SessionLogWriter O(turn) append + Mirror facade

**Branch:** `claude/asv3-wp05-session-log-append` (cut from `origin/develop`)
**Lane:** Log (independent — no inter-WP dependency)
**Estimated size:** medium (~300–450 LOC: VaultPort extension across three adapters, writer rewrite, new tests; existing writer test surface largely preserved)

## Goal (one sentence)

Replace `SessionLogWriter`'s O(turns²) rewrite-per-append pattern with an O(turn) append, gated behind a new `VaultPort.appendFile` method (with fallback for adapters that can't honour it), and front the public surface with a small `SessionLogMirror` facade that hides the queueing + frontmatter-rewrite mechanics from callers.

## Problem statement

`src/application/chat/SessionLogWriter.ts` (505 LOC, 83.21% statement coverage per the 2026-05-17 audit) calls `vault.readFile(resolvedPath)` followed by `vault.writeFile(resolvedPath, next)` on every `appendUserAssistant` (lines 313–316) and every `appendProposalDecision` (lines 372–375). That means an N-turn session pays O(N) on every append → O(N²) cumulative I/O work and bytes-on-the-wire for what is conceptually a single tail-append plus a tiny in-place frontmatter `updated:` field update. The conflict-resolution path in `_resolveUniquePath` also reads each candidate (line 456: `await this.vault.readFile(candidate)`) when scanning for `session_id` collisions — that's per-collision and acceptable. The hot path is the per-turn append.

`VaultPort` (src/domain/ports/VaultPort.ts:7-8) exposes `readFile` and `writeFile` but no `appendFile`. The Obsidian adapter wraps `Vault.adapter.append(path, data)` natively; the localstorage and mock adapters need shimmed `append` implementations (read + concat + write — same as today, but localised to one adapter rather than baked into application logic). The audit's WP-5 trigger ("SessionLogWriter O(turn) append + Mirror facade") explicitly calls out the port-extension as part of this WP's scope.

Secondary problem: the writer's public surface — `appendUserAssistant` (fire-and-forget) and `appendProposalDecision` (await-required, throws `SessionLogNoSessionError`) — leaks two contracts that callers must remember. The audit asks for a `SessionLogMirror` facade that exposes a single `mirrorTurn(thread, turn)` / `mirrorProposalDecision(args)` pair with clearer naming + a single error-handling shape, while the writer underneath remains the I/O engine.

## Scope — IN

**Extend `VaultPort` with `appendFile(path, content)`.** Three adapters implement it:

- `ObsidianBridge` (`src/infrastructure/obsidian/ObsidianBridge.ts`) — delegates to `Vault.adapter.append(path, data)`. If the file doesn't exist, calls `Vault.create(path, data)` (matches the existing first-write code path).
- `MockBridge` (`src/infrastructure/mock/MockBridge.ts`) — concat into the in-memory map; mirror through the same `_files` storage so `readFile` after `appendFile` returns the appended content. Tests that assert on `appendFile` calls observe via the existing `mockBridge.calls` recorder.
- `LocalStorageBridge` (`src/infrastructure/localstorage/LocalStorageBridge.ts`) — read existing value, concat, write back. Same O(N) per write at the storage layer — acceptable for the GitHub Pages demo because the demo doesn't run real chat sessions.

**Rewrite `SessionLogWriter` append paths to use `appendFile`.** The fresh-file path stays as today (`writeFreshFile` → `writeFile`). The "file exists, append a turn" path becomes:

1. Read the frontmatter only (first `--- … ---` block — small + bounded). The body is no longer read.
2. Rewrite the frontmatter with the new `updated:` timestamp; `writeFile` ONLY the frontmatter block prefix in-place? No — the simpler approach: maintain a per-log in-memory `_frontmatterByPath` cache that's seeded on first `appendFile` for that path (read once); subsequent appends compose `${updatedFrontmatter}\n${newTurnBlock}` and call `writeFile` with the frontmatter + then `appendFile` for the body delta.

   Even simpler approach (and the one this WP elects): **bifurcate frontmatter and body storage at the writer level**. Track `(frontmatterBytes, bodyOffset)` per path in a private cache. On append: rewrite the frontmatter window via `vault.writeFile(path, newFrontmatter + bodyTail)` only when the `updated:` timestamp ticks; for the new turn-block, call `vault.appendFile(path, newTurnBlock)`. This pays O(frontmatter) per append, not O(body), and the frontmatter is bounded by the 5-key schema (always < 256 bytes in practice).

**Add a `SessionLogMirror` facade.** Two public methods:

- `mirrorTurn(thread, turn): Promise<void>` — fire-and-forget, swallows on no-session-id.
- `mirrorProposalDecision(args): Promise<void>` — await-required, throws on no-session-id (preserving REQ-ASM-046).

Internally calls the writer. The facade does not add new error shapes; it only re-exposes the writer's surface under more discoverable names. Callers in `src/application/chat/` and `src/infrastructure/obsidian/` switch to the facade.

**Update tests.** The existing 30+ test cases in `tests/application/chat/SessionLogWriter.test.ts` should keep passing with minimal edits (their assertions are on the resulting vault state, not on which port methods got called). Add new tests:

- `appendFile is used for the body, writeFile for the frontmatter` — assert by counting `mockBridge.calls.writeFile.length` and `mockBridge.calls.appendFile.length` after N turns. For N turns there should be exactly N appendFile calls and (with the frontmatter caching) exactly N writeFile calls for the frontmatter rewrite — net I/O remains 2N small ops instead of N reads + N full writes.
- `appendFile fallback for adapters without native append` — assert via `MockBridge` that the fallback yields the same byte stream as the native path.

## Scope — OUT

- Other VaultPort surface changes (don't add `appendBytes`, `truncate`, etc).
- The session-log frontmatter schema (5 keys — see SPEC-ASM-001 §2.3). Stable.
- The conflict-suffix resolution algorithm (`_resolveUniquePath`). Stable.
- `appendProposalDecision`'s reject-on-no-session contract (REQ-ASM-046). Stable.
- The mutex (`Map<logPath, Promise<void>>`). Stable.
- Mocking the proposal-commit pipeline (`commitFileWriteProposal`) — out of scope; callers swap from `writer.appendProposalDecision` to `mirror.mirrorProposalDecision` and that's the whole migration on the call side.

## Approach

1. **Extend `VaultPort`** with `appendFile(path: string, content: string): Promise<void>`. Update all three adapters. Add `MockBridge.calls.appendFile` recorder. New tests assert each adapter honours the contract.
2. **Add the in-memory frontmatter cache** to `SessionLogWriter`. `Map<resolvedPath, { frontmatter: string, fileExists: boolean, lastUpdated: string }>`. Seeded on first read per path; invalidated on full rewrite (i.e. on a conflict-suffix branch fork).
3. **Rewrite `appendUserAssistant`'s file-exists branch** to use the cache + `appendFile` for the body block; `writeFile` for the frontmatter rewrite. Same for `appendProposalDecision`.
4. **Stand up `SessionLogMirror`** as a thin class wrapping the writer; constructor injects the writer. Move public-facing JSDoc to the facade; keep the writer's internal contracts.
5. **Migrate callers.** Audit grep `appendUserAssistant\|appendProposalDecision` → swap to the facade.
6. **Run the full pre-PR gate every iteration.**

## Deliverables

**New files:**

- `src/application/chat/SessionLogMirror.ts` — the facade.
- `tests/application/chat/SessionLogMirror.test.ts` — facade tests asserting delegation.
- `tests/domain/ports/VaultPort.appendFile.test.ts` (or extend existing `VaultPort` contract test if present) — asserts the contract for all three adapters via `fakeModulePorts()`.

**Modified files:**

- `src/domain/ports/VaultPort.ts` — add `appendFile` method.
- `src/infrastructure/obsidian/ObsidianBridge.ts` — implement `appendFile`.
- `src/infrastructure/mock/MockBridge.ts` — implement `appendFile` + recorder.
- `src/infrastructure/localstorage/LocalStorageBridge.ts` — implement `appendFile`.
- `src/application/chat/SessionLogWriter.ts` — bifurcated frontmatter/body path; frontmatter cache.
- `tests/application/chat/SessionLogWriter.test.ts` — adapt existing assertions; add the I/O-count test.
- `tests/__fakes__/fake-ports.ts` — surface the new `appendFile` from `MockBridge`.
- Wiring at the caller sites: `src/application/chat/` and `src/infrastructure/obsidian/` consumers of `SessionLogWriter` switch to `SessionLogMirror`.

## Definition of done

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors.
- [ ] `npm run test` passes; new tests for `SessionLogMirror` ≥ 90% statements/branches; `VaultPort.appendFile` contract test asserts all three adapters.
- [ ] `npm run build` + `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` — `SessionLogWriter` statement coverage rises from 83.21% to ≥ 90% (the audit gap).
- [ ] **O(turn) closed**: a new test in `SessionLogWriter.test.ts` mirrors 100 turns to a single thread and asserts `mockBridge.calls.appendFile.length === 100` and `mockBridge.calls.readFile.length === 1` (a single seeding read). Without the fix, this is 100/100.
- [ ] **Mirror facade exists** and is the single caller of `SessionLogWriter` from outside `src/application/chat/`. Direct writer imports outside the application/chat folder fail typecheck (private export pattern, or an ESLint scope rule — pick the simpler).
- [ ] PR opened against `develop`, title `perf(asv3): SessionLogWriter O(turn) append + Mirror facade (WP-5)`, body cites the audit's 83% coverage gap and the O(n²) trigger.

## Risks / known unknowns

The Obsidian `Vault.adapter.append` API exists on `DataAdapter` (Obsidian's internal interface) — confirm it's exposed on `App.vault.adapter` and not just a private path. If only `Vault.process` is public, fall back to a per-adapter read-modify-write inside the Obsidian adapter only (still wins because the writer no longer reads the body on every turn, but the wire cost stays O(N) in that adapter). Worst case the perf win is concentrated in adapters that DO support native append (Mock + LocalStorage) — file a carry-out for the Obsidian adapter to land its own `appendFile` once the runtime API is confirmed. The frontmatter cache is a thread-local in-memory hash; a second plugin process (impossible in Obsidian's single-window model, but worth noting) racing on the same vault file would invalidate it — accept this trade-off and document in the JSDoc.

## RALPH iteration template

```
loop:
  1. Read brief.md + loop-state.md.
  2. Pick the next failing check (audit → typecheck → lint → test → build → docs → DoD).
  3. Implement the smallest change that moves one check red→green.
     STAY IN SCOPE — no proposal-commit / approval-port changes, no schema changes.
  4. Run from inside .worktrees/asv3-wp05:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck && npm run lint && npm run test \
         && npm run build && npm run build:web && npm run docs:api
  5. Update loop-state.md.
  6. If all gates green AND all DoD met → commit, push, open PR via gh.
     Else → goto 1.
  Hard cap: 10 RALPH iterations.
```

## Conventions

- **Worktree:** `.worktrees/asv3-wp05` (already created, branch `claude/asv3-wp05-session-log-append`).
- **Commits:** conventional, squash on merge. Prefix `perf(asv3):`.
- **PR target:** `develop`. Ready for review.
- **Do not touch:** `MockApprovalPort`, `commitFileWriteProposal`, the frontmatter SCHEMA itself, the conflict-suffix algorithm.
- **Coordinate with WP-13** (test catch-up) — if it lands first, you'll inherit cleaner test fixtures; if you land first, WP-13 adds tests on top of the new `appendFile` shape. Either way: stay in your lane.
- **Never** push to `develop`. Never force-push.
