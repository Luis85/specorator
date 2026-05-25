---
id: REVIEW-TS-001
title: Threads & Sessions (P3) — parity + correctness review (autonomous self-review gate)
stage: review
feature: threads-sessions
area: TS
epic: claudian-reboot
phase: P3
status: complete
owner: reviewer
integration_branch: next
branch_reviewed: feature/threads-sessions
head: 5d1b52f
base: 8b7cb77 (merge-base with origin/develop)
reference: D:\Projects\claudian-main   # MIT, read-only parity truth
created: 2026-05-25
updated: 2026-05-25
inputs:
  - specs/threads-sessions/{requirements.md,design.md,spec.md,tasks.md,workflow-state.md,implementation-log.md}
  - docs/adr/ADR-TS-001/002/003
  - D:\Projects\claudian-main\src (parity)
verdict: Blocked
---

# Review — Threads & Sessions (P3)

## Verdict: **BLOCKED** (autonomous self-review gate; pre-merge to `next`)

Two **P1 blockers** are dead/incomplete on the **real-CLI / real-Obsidian path** while
unit-green via Mock/Fixture stores — the exact P2 R-RR-001 failure mode this gate exists to catch.
Both must be fixed (or explicitly descoped with a recorded ADR amending REQ-TS-019/021) before P3
merges. A cluster of P2 correctness bugs around persistence/fork lineage materially break the
"resume / fork survives reload" north star. The architecture (DDD, narrow ports, additive growth,
provider-addressed seam, per-tab isolation, DTO-only store) is **genuinely solid** and the unit suite
is large and well-structured — the gaps are concentrated at the runtime/persistence seams that unit
tests with recorded-no-op runtimes and hand-seeded fixtures cannot exercise.

This is not "blocked to be safe": REQ-TS-019/021 (rewind eligibility + conversation-only rewind
*executing*) and REQ-TS-018 (fork derives provider lineage) are **must** requirements whose real-path
behaviour does not match their acceptance criteria, and the failure is invisible to the green suite.

---

## Scope note (base resolution)

`origin/HEAD → origin/develop`; `merge-base(HEAD, origin/develop) = 8b7cb77`. Because
`feature/threads-sessions` is cut from the `next` reboot integration branch (not `develop`), the raw
`8b7cb77...HEAD` diff is the **entire P0+P1+P2+P3 reboot** (856 files). I scoped the review to the P3
threads-sessions surface (the files enumerated in the brief + their Claudian counterparts), treating
P0/P1/P2 as the accepted baseline. The P3 commit range is `0a88dd5..5d1b52f` plus the domain/infra/app
batches (`ccb9e5c..9a36954`).

---

## Findings (prioritised)

Severity: **P1** = blocker (real-path behaviour contradicts a `must` REQ; must fix or descope-by-ADR);
**P2** = important (correctness bug or parity gap that degrades the north-star flow; should fix this
phase); **P3** = polish (parity/cosmetic; schedule). Each cites our `file:line` vs Claudian `file:line`.

### Correctness bugs (real-path defects)

| ID | Sev | Title | Our code vs Claudian | Recommended fix | Owner |
|---|---|---|---|---|---|
| **R-TS-001** | **P1** | **Rewind eligibility is dead on every real conversation** — `assistantMessageId` is never set on the live turn path | `rewindEligibility.isRewindEligible` (`src/application/threads/rewindEligibility.ts:26`) keys solely on `message.assistantMessageId`. **Nothing populates it:** `tabsStore.assistantMessage()` (`src/ui/stores/tabsStore.ts:114`) creates `{id,role,content,timestamp}` with no `assistantMessageId`; the sink legs (`tabsStore.ts:514-662`) never set it; `ClaudeStreamReducer` (`reduceClaudeStream.ts`) surfaces no turn/message id; `MockChatRuntime.query` never sets it. The **only** carriers of `assistantMessageId` in the whole tree are the LocalStorage demo fixtures (`FixtureHistoryStore.ts:31,54,77`) and hand-built test rows (`tests/ui/stores/tabsStore.test.ts:290`). So `canRewindMessage` (`tabsStore.ts:358`) → `isRewindEligible` → **always `false`** for any conversation the user actually has → the rewind affordance (`MessageTurn.vue:56,96`) **never renders**. Claudian derives the id from the SDK turn UUID (`ClaudeChatRuntime.ts:500-515`, `rewind.ts findRewindContext` scans real `assistantMessageId`/`prevAssistantUuid`). | Surface a per-turn assistant id from the runtime and stamp it on the assistant `ChatMessage` when the turn completes. The CLI `result`/`assistant` NDJSON events carry a `message.id`/`uuid` — capture it in `ClaudeStreamReducer`, add a `done`/`assistant-id` carrier to the stream or set it in `onDone`, and write it through the sink. Until then the entire rewind surface (REQ-TS-019/020/021) is unreachable in production. | dev (runtime + reducer + tabsStore sink) |
| **R-TS-002** | **P1** | **Conversation-only rewind does not actually rewind the provider session on the real CLI** — the checkpoint is stored then discarded | `ClaudeCliChatRuntime.setResumeCheckpoint` stores `this.resumeCheckpoint` (`src/infrastructure/obsidian/ClaudeCliChatRuntime.ts:169-173`), but `query()` only **logs and clears** it (`ClaudeCliChatRuntime.ts:80-85`) and `_buildArgs` emits **only** `--resume <sessionId>` (`ClaudeCliChatRuntime.ts:193-206`) — the checkpoint is never passed to the CLI. So the next turn resumes the **latest** session state, not the rewound point. The UI transcript is truncated (`tabsStore.truncateTo`, `tabsStore.ts:336`) so it *looks* rewound, but the model continues from where it actually left off. Claudian passes the checkpoint to the Agent SDK as `resumeSessionAt` (`ClaudeQueryOptionsBuilder.ts:164-166`: `options.resumeSessionAt = ctx.resume.sessionAt`), driven by `pendingResumeAt` (`ClaudeChatRuntime.ts:500-515`), set by `executeClaudeRewind` `mode==='conversation'` (`ClaudeRewindService.ts:172-176`). | Two real options: (a) if the `claude` CLI exposes a resume-at flag, pass `this.resumeCheckpoint` in `_buildArgs`; (b) if it does not (the per-message rewind is an Agent-SDK feature, not a `--print` CLI feature), the conversation-only rewind cannot truly rewind the provider on the subprocess transport — escalate to an ADR that either (i) switches this seam to the SDK transport, or (ii) descopes REQ-TS-021's "next turn continues from there" to "transcript truncated; next turn re-sends the truncated history" and documents the divergence. Do not ship the current silent no-op. | dev → architect (transport ADR likely) |
| **R-TS-003** | **P1** | **Fork lineage (`forkSource` provider-state) is computed then thrown away** — forked tabs never resume from the source session | `buildForkPlan` correctly derives `providerState.forkSource = { sessionId, resumeAt }` (`src/infrastructure/history/buildForkPlan.ts:42-44`), but `tabsStore.forkActive` builds a `TabLoadPayload` that **drops `result.value.providerState`** entirely (`tabsStore.ts:382-387` — payload has only `conversationId/title/messages/sessionId`, and `sessionId:null`). `TabLoadPayload` (`tabsStore.ts:63`) has no providerState field. Then `_persistTab` hard-codes `providerState: {}` (`tabsStore.ts:693`). So the forked conversation persists with **no lineage** → `resolveSessionId` returns `null` → the next turn in the forked tab cold-starts instead of continuing from the source session at the fork point. Claudian threads `buildForkProviderState` into the persisted conversation and resolves it on resume (`ClaudeConversationHistoryService.ts:329-338`, `:323-327`; the SDK then forks via `forkSession:true`, `ClaudeQueryOptionsBuilder.ts:167-169`). REQ-TS-018 acceptance ("the new tab's session-state references the source session id with a resume offset") is not met on the real path. | Add a `providerState?: ProviderSessionState` field to `TabLoadPayload`, carry `result.value.providerState` through `forkActive` → `loadIntoTab` → `_persistTab` (persist it instead of `{}`), and have `loadIntoNewTab`/`loadIntoTab` set a `TabState.providerState` (new DTO field) so the first persist round-trips it. Also note the forked tab needs the SDK `forkSession` semantics — interacts with R-TS-002's transport question. | dev |
| **R-TS-004** | **P2** | **`_persistTab` resets `createdAt` and wipes `providerState` on every save** — breaks history ordering + lineage durability | `_persistTab` (`tabsStore.ts:674-699`) sets `createdAt: now` and `updatedAt: now` **on every call** and `providerState: {}` unconditionally. Consequences: (1) `createdAt` is rewritten to "now" on the title-ladder re-save and any later persist, losing the true creation time; (2) `updatedAt === createdAt` always, so the relative-date in the history list is wrong after the first turn; (3) any `forkSource` lineage (R-TS-003) and any future provider-session id is erased on the next save; (4) on resume→continue→persist, the record's `createdAt` jumps forward, reordering the history list incorrectly (REQ-TS-010 newest-first). Claudian preserves `createdAt` and merges provider-state across saves (`ConversationController.save`, `SessionStorage.ts`). | On re-persist, read-or-preserve the existing `createdAt` (hydrate first, or keep it on `TabState`); only bump `updatedAt`. Persist the tab's `providerState` rather than `{}`. Consider `updateMeta` for title-only re-saves (the port already supports meta-only patch, used nowhere from the store yet). | dev |
| **R-TS-005** | **P2** | **Resume clobbers the active tab's in-flight/unsaved conversation with no guard** | `ResumeSessionDropdown.onSelectRow` always resumes into the **active** tab (`src/ui/chat/ResumeSessionDropdown.vue:70-86`) via `loadIntoTab(activeId, …)`, which overwrites `messages/title/conversationId` (`tabsStore.ts:311-327`). If the active tab is mid-stream or holds an unsaved conversation, it is silently destroyed — and if mid-stream, the per-tab runner is **not cancelled** before the overwrite (the in-flight turn keeps mutating the now-replaced `TabState` via its closed-over `tabId`, corrupting the resumed transcript). Claudian resume opens/targets a tab deliberately and guards a busy tab. | Resume into a **new tab** (or an empty active tab) when the active tab is non-empty/streaming; or cancel the active runner + confirm before overwriting. At minimum call `cancelTurn()`/`_deps(id).runner.cancel()` before `loadIntoTab` when `status==='streaming'`. | dev |
| **R-TS-006** | **P2** | **Compact turn ignores its own `Result` outcome and can't surface the start-failure** path correctly | `tabsStore.compactActive` (`tabsStore.ts:426-439`) sets `status='streaming'`, runs the turn, and on `!result.ok && kind!=='runtime-throw'` calls `_handleStartFailure`. But it pushes **no assistant message** and never calls `onAssistantStart`, so a compact turn that streams text/blocks has **no live message** to attach to (`_liveMessage` returns `undefined` because `liveAssistantId` is null) — every sink leg early-returns, including `onContextCompacted` (`tabsStore.ts:651-655`). So the `context_compacted` block (the whole point of REQ-TS-023) is **dropped** unless the runner itself emits `onAssistantStart` first. `sendMessage` works because the runner's `onAssistantStart` leg fires; verify the compact path actually receives `onAssistantStart` from `RunChatTurnUseCase` — if it relies on a streamed assistant turn, fine, but the compact command may not produce one. | Confirm `RunChatTurnUseCase.run` emits `onAssistantStart` for a `/compact` turn before any `context_compacted`. If compact does not stream a normal assistant turn, seed a live assistant message in `compactActive` (as `sendMessage` does not — it relies on the leg) or route the boundary onto a dedicated block independent of `liveAssistantId`. Add a component test that drives a real `context_compacted` chunk through `compactActive` (not just through `sendMessage`). | dev + qa |

### Parity gaps

| ID | Sev | Title | Our code vs Claudian | Recommended fix | Owner |
|---|---|---|---|---|---|
| **R-TS-007** | **P2** | **History list uses emoji/raw glyphs instead of Lucide icons** (brand + parity) | `ResumeSessionDropdown.vue` renders `⌃` (opener, `:166`), `✎` (rename, `:219`), and **`🗑` (delete, `:228`)** as literal text. `🗑` is an emoji — a brand-blocking-class literal in user-visible UI. The codebase already has the P2 icon seam (`SpIcon`, used correctly in `MessageTurn.vue:91,102,112,122`). Claudian uses Lucide `chevron-up`/`pencil`/`trash-2` (`shared/components/ResumeSessionDropdown.ts`, `components/history.css`). | Replace the three glyphs with `<SpIcon name="chevron-up|pencil|trash-2" />`. Removes the emoji, restores icon parity, and gives the delete its `git-fork`-style hover-red affordance. | dev |
| **R-TS-008** | **P3** | **Tab-badge state-machine priority diverges from Claudian** | Our `badgeState` priority is active > **streaming > attention** > idle (`src/ui/chat/TabBar.vue:23-28`). Claudian's is active > **attention > streaming** > idle (`features/chat/tabs/TabBar.ts:49-57`). A non-active tab that is both streaming and needs-attention shows the wrong border. Rare in practice (attention is set at `onDone` when streaming clears), so low impact at P3, but it is a literal parity-charter divergence. | Swap the two checks in `badgeState` to match Claudian (attention before streaming). | dev |
| **R-TS-009** | **P3** | **Per-badge `data-provider` not set; streaming brand colour reads from the root only** | Claudian sets `data-provider` on **each** badge so the streaming border picks up the per-tab provider brand (`TabBar.ts:66`). Ours sets `data-provider="claude"` only on the surface root (`ChatSurface.vue:116`) and the badge streaming border resolves from the root token (`tokens.css §4.10`, `--sp-tab-border-streaming`). Identical result while Claude-only (P3), but the per-tab brand seam is absent — re-surfaces at P9 (multi-provider). Correctly out-of-P3-scope as a *behaviour* but worth a one-line note so P9 doesn't treat it as new. | Optional now: emit `:data-provider="tab.providerId"` per badge (tab has no providerId field yet — defer to P9 with the provider-per-tab work). Record as a known P9 follow-up. | (defer P9) |
| **R-TS-010** | **P3** | **`resolveSessionId` omits the `providerSessionId` lookup Claudian checks first** | Both stores resolve `meta.sessionId ?? forkSource?.sessionId` (`MockHistoryStore.ts:77`, `VaultFileHistoryStore.ts:110`). Claudian's order is `providerSessionId ?? sessionId ?? forkSource?.sessionId` (`ClaudeConversationHistoryService.ts:323-327`). Internally consistent today (the store never writes `providerSessionId`), but once a provider session id is persisted (needed for R-TS-003), the lookup must include it or resume binds the wrong/null id. | When R-TS-003 lands and `providerState.providerSessionId` becomes populated, add it as the first lookup in both stores. | dev |

### Correct deferrals (out-of-scope, NOT gaps)

- Composer command-words (`/resume` `/fork` `/compact` `/clear` `/new`) — **P4** (NG1). P3 correctly exposes
  these as buttons/menus only; no command-word handler present. ✔
- Inline approvals / ask-user / exit-plan — **P7** (NG2). None present. ✔
- Attachments / images / selection — **P5** (NG3). None present. ✔
- MCP client / config / selector — **P8** (NG4). None present. ✔
- Codex/Opencode history + per-tab provider switching + `HomeFsPort`/JSONL/ACP formats — **P9** (NG6/NG8).
  Exactly one Claude `ProviderHistoryPort` impl is wired; provider-addressed seam verified clean (below). ✔
- `code-and-conversation` rewind filesystem/git effect — **gated** (NG7). `RewindConversationUseCase`
  takes no `VaultPort` and returns a notice for the code mode (`RewindConversationUseCase.ts:58-68`,
  `tabsStore.rewindActive` `:409-413`) — cannot touch fs by construction. ✔ (This deferral is implemented
  correctly; it is the conversation-mode *execution* — R-TS-002 — that is broken.)
- i18n of P3 microcopy across 10 locales — **P11** (NG9). English source strings only. ✔
- Tabs persisting across reload — **out of P3 scope.** Claudian's `TabManager` does not persist open tabs
  across reload either; P3 persists *conversations* (resumable from history), not *open tabs*. Our reset to
  one fresh empty tab on remount (`ChatSurface.onBeforeUnmount → $reset`, `ChatSurface.vue:75-77`) matches
  the charter §3.2 intent. Not a gap.

---

## Requirements compliance

| REQ | Status | Evidence / note |
|---|---|---|
| REQ-TS-001 open new tab | **Satisfied** | `tabsStore.openTab`/`_spawnTab` (`tabsStore.ts:239-270`); TEST-TS-006. |
| REQ-TS-002 switch tab | **Satisfied** | `switchTab` clears attention (`tabsStore.ts:273-278`); TEST-TS-007. |
| REQ-TS-003 close tab | **Satisfied** | `closeTab` cancels runner + activates neighbour (`tabsStore.ts:284-301`). |
| REQ-TS-004 min one tab | **Satisfied** | close-last re-spawns (`tabsStore.ts:291-294`). |
| REQ-TS-005 tab ceiling | **Satisfied** | `openTab` clamp + `showInfo` (`tabsStore.ts:261-269`); `clampMaxTabs` (`PluginSettings.ts`). |
| REQ-TS-006 per-tab streaming isolation | **Satisfied** | one runtime per tab + sink scoped by closed-over `tabId` (`tabsStore.ts:507-513`); strong design; TEST-TS-007 + main.ts.test. |
| REQ-TS-007 background-activity badge | **Satisfied** (priority nit R-TS-008) | `markAttention` + `badgeState` (`tabsStore.ts:304-308`, `TabBar.vue:23`). |
| REQ-TS-008 persist conversation | **Partially** | persists on first-turn done (`_persistTab`), but `createdAt`/`providerState` bugs (R-TS-004) + lineage drop (R-TS-003). Real round-trip unproven (manual TEST-TS-M1 pending). |
| REQ-TS-009 metadata record | **Satisfied** | `ConversationMeta` shape (`ConversationRecord.ts`); TEST-TS-002. |
| REQ-TS-010 list newest-first | **Satisfied** (date label wrong, R-TS-004) | stores sort `updatedAt` DESC; but `updatedAt===createdAt` makes the relative date misleading. |
| REQ-TS-011 rename | **Satisfied** | `RenameConversationUseCase` sets `titleManual` (`tabsStore`/use case); TEST-TS-012. |
| REQ-TS-012 delete | **Satisfied** | `DeleteConversationUseCase` idempotent; Obsidian `DeleteConfirmModal` seam (no `window.confirm`). |
| REQ-TS-013 resume into tab | **Partially** | hydrate+resolve+render rich blocks works (solid); but clobbers active tab (R-TS-005) and real-CLI resume-binding unproven (TEST-TS-M2 pending). |
| REQ-TS-014 resume renders P2 blocks collapsed | **Satisfied** | record round-trips `contentBlocks`; `MessageTurn` renders `MessageBlocks` when present (`MessageTurn.vue:80,135`). This is the most-likely-gap and it is correctly handled. |
| REQ-TS-015 resume keyboard nav | **Satisfied** | Arrow/Enter/Escape + focus return (`ResumeSessionDropdown.vue:108-135`). |
| REQ-TS-016 fork affordance gated | **Satisfied** | `canForkActive` → `supportsFork` (`tabsStore.ts:352-355`, `MessageTurn.vue:55`). |
| REQ-TS-017 fork-target Obsidian Modal | **Satisfied** | `ForkTargetModal` + `CHOOSE_FORK_TARGET` seam; no `window.*`. |
| REQ-TS-018 fork derives lineage | **NOT satisfied** | derive computed but **dropped** before persist (R-TS-003). Transcript truncates; lineage lost. |
| REQ-TS-019 rewind eligibility | **NOT satisfied** | `assistantMessageId` never set on real turns → control never shows (R-TS-001). |
| REQ-TS-020 two-mode rewind menu | **Satisfied** (unreachable) | menu present + two distinct icons (`MessageTurn.vue:104-125`); unreachable until R-TS-001. |
| REQ-TS-021 conversation-only rewind executes | **NOT satisfied** | UI truncates but the provider session is not actually rewound on the CLI (R-TS-002). |
| REQ-TS-022 code rewind gated | **Satisfied** | no fs/VaultPort by construction + notice (`RewindConversationUseCase.ts:58-68`). |
| REQ-TS-023 compact | **At risk** | reuses P2 sink leg, but the boundary may be dropped if compact has no live assistant message (R-TS-006). |
| REQ-TS-024 fallback→AI title, manual wins | **Satisfied** | title ladder (`tabsStore._runTitleLadder:706-726`); fresh runtime per title call (no main-stream pollution). |
| REQ-TS-025 title status observable | **Satisfied** | `titleStatus` + spin row (`ResumeSessionDropdown.vue:149-211`); failure keeps fallback, no `showError`. |
| REQ-TS-026 provider-addressed, zero branch | **Satisfied** | grep of `src/application/**` for `provider === 'claude'` → 0 matches; seams used everywhere. |
| REQ-TS-027 only Claude wired | **Satisfied** | one `ProviderHistoryPort` impl per bridge, `providerId='claude'`. |
| REQ-TS-028 additive over P1/P2 | **Satisfied** | 9 P1 `ChatRuntimePort` members intact + 3 additive; `ChatMessage` 6+2 fields intact + 3 optional; contract tests TEST-TS-003/004. |

**Score: 18 satisfied · 1 at-risk · 1 partial-with-bugs (×3 entries) · 3 not-satisfied (REQ-TS-018/019/021).**

## Design / spec compliance

- ADR-TS-001 (vault-file history + `ProviderHistoryPort`): **honoured** — port shape, codec, three bridges,
  fork-as-derive helper all match. The persist *call site* (R-TS-003/004) does not use the derived state.
- ADR-TS-002 (tabsStore + additive runtime growth): **honoured** — Option A store, runners outside
  reactive state in a WeakMap sidecar, one runtime per tab, router stays removed. Strong.
- ADR-TS-003 (cold-start side-query title-gen): **honoured and correct** — `GenerateTitleUseCase` uses a
  **fresh** `createRuntime()` (`ChatSurface.vue:64`), so `forceColdStart` pollution is moot; the side-query
  cannot steer the tab's main session. Good call among the two options the spec allowed.
- The implementation-log's recorded deviations (T-TS-005 runtime members landing with the domain growth;
  RewindResult carrying `checkpointMessageId`/`notice`; compact via `/compact` text) are reasonable and
  logged. **However**, the log claims the runtime members "map to the CLI session/resume seam" — R-TS-002
  shows the rewind-checkpoint half of that mapping is a stored-then-discarded no-op, not a real mapping.
  The deviation log should have flagged this as a manual-leg-only / unproven seam, not a completed one.

## Constitution check

- Article I (spec-first): mostly honoured; R-TS-002 is a case where the spec's REQ-TS-021 ("next turn
  continues from there") may be physically unachievable on the chosen subprocess transport — that is a
  **requirements/transport defect to resolve at the spec/ADR layer**, not to paper over in code.
- Article V (traceability): `traceability.md` is **pending** (not yet generated) — see below.
- Article IV (quality gates two-layer): deterministic suite green (885 unit) but the green is partly
  **false confidence** on the rewind/fork seams (fixtures carry fields the real path never emits). This is
  the critic-layer catch.

## Risks

- The R-RR-001 class (real-path dead, unit-green via mocks/fixtures) **recurred** at three seams
  (R-TS-001 rewind-id, R-TS-002 checkpoint, R-TS-003 fork lineage). Systemic risk: the recorded-no-op Mock
  runtime + seeded fixtures let the suite pass without ever exercising the field/flag the production runtime
  must produce. **Mitigation for future phases:** a contract test that drives a *real-shaped* reducer output
  (or the actual `ClaudeStreamReducer`) and asserts `assistantMessageId`/session-resume args are present,
  rather than asserting against hand-seeded DTOs.

## Brand review

Applicable (diff touches `*.vue` producing user-visible UI). Dispatched inline (no separate subagent in
this run). One **blocking-class** finding: the `🗑` emoji + raw glyphs in `ResumeSessionDropdown.vue`
(R-TS-007) — emoji in user-visible UI violates the brand rule and breaks Lucide-icon parity with Claudian.
All other P3 surfaces use `SpIcon` and `--sp-*` tokens correctly (no token literal, no gradient, no white
page bg, no icon-library import). `lint:style-tokens` reported clean per the implementation log. Folding
R-TS-007 into the verdict: contributes to **Blocked** (must be fixed with the other blockers).

## Quality metrics evidence

`specorator quality:metrics -- --feature threads-sessions --json`: overallScore **64.3**, maturity level 1
("Documented"). The score reflects pending stage artifacts (test-plan/test-report/review/traceability) and 5
frontmatter gaps — it is **not** a release signal and does not offset the code findings. Do not read 64.3 as
"needs polish"; the blockers are functional, not documentary.

## What's solid (do not regress)

- Per-tab streaming isolation via one-runtime-per-tab + `tabId`-scoped sink closures (`tabsStore.ts:507`) —
  clean, well-tested (the concurrent-stream isolation EC-TS-3/13 path).
- The pure codec (`conversationRecordCodec.ts`) — total, never-throws, strips non-contract fields, round-trips
  rich `contentBlocks`. Resume *does* reconstruct rich blocks (the flagged most-likely-gap is actually fine).
- Provider-addressed seam discipline: **zero** `provider === 'claude'` branches in app/UI.
- Additivity: P1 nine-member port + P1/P2 `ChatMessage` byte-intact; growth is purely additive.
- Title-gen isolation via a fresh runtime — avoids the `forceColdStart` pollution trap.
- DTO-only store boundary; runners in a WeakMap sidecar outside reactive state.
- Obsidian-Modal seams (`modalSeam.ts` + plugin modals) keep Vue free of `obsidian`; no `window.confirm`.

---

## Required before P3 merges to `next`

1. Fix **R-TS-001** (surface + stamp `assistantMessageId` on real turns) — unblocks REQ-TS-019/020.
2. Resolve **R-TS-002** (real conversation-rewind, or an ADR descoping REQ-TS-021 on the subprocess transport).
3. Fix **R-TS-003** + **R-TS-004** (carry & persist fork lineage; stop resetting `createdAt`/wiping providerState) — unblocks REQ-TS-018, fixes REQ-TS-008/010.
4. Fix **R-TS-006** (compact boundary reaches the block) and **R-TS-005** (resume guard).
5. Fix **R-TS-007** (emoji → `SpIcon`).
6. After fixes: the QA stage must add **real-shaped** contract tests for the three seams (not fixture-seeded),
   generate `test-plan.md`/`test-report.md`, and the reviewer regenerates `traceability.md`.
7. R-TS-008/009/010 are P3-polish — schedule, not blockers (R-TS-009/010 may ride P9).
