---
feature: Plugin shell reboot (P0 — Claudian-shaped rewrite foundation)
area: PSR
slug: plugin-shell-reboot
current_stage: implementation
status: implementation-complete-pending-review
last_updated: 2026-05-24
last_agent: dev (P0 implemented — all 34 T-PSR done, verify green; manual + CI pending human)
epic: claudian-reboot
phase: P0
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: complete
  research.md: skipped
  requirements.md: complete
  design.md: complete
  spec.md: complete
  tasks.md: complete
  implementation-log.md: complete
  test-plan.md: complete
  test-report.md: in-progress  # manual Obsidian checks (TEST-PSR-018..021) pending human run
  review.md: pending
  release-notes.md: pending
  retrospective.md: pending
adrs:
  - id: ADR-PSR-001
    path: docs/adr/ADR-PSR-001-reboot-plugin-shell.md
    status: accepted
    note: reboot supersedes the feature-facing scope of ADR-008 + the MPS/AUX agent surface
  - id: ADR-PSR-002
    path: docs/adr/ADR-PSR-002-settings-storage-device-local.md
    status: accepted
    note: user/device-scoped settings → device-local store (not data.json), load-or-default, NO migration (REQ-PSR-013 / CHARTER-REQ-FRESH); amended 2026-05-24 to drop migrate-and-clear; SecretStorePort ADR deferred to P1
---

# Workflow state — plugin-shell-reboot (P0)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | complete |
| 2. Research | `research.md` | skipped (Claudian source is the sole reference) |
| 3. Requirements | `requirements.md` | complete |
| 4. Design | `design.md` | complete |
| 5. Specification | `spec.md` | complete |
| 6. Tasks | `tasks.md` | complete |
| 7. Implementation | `implementation-log.md` | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Skips

- Stage 2 (Research) — skipped per Standard-depth decision. Claudian
  (`D:\Projects\claudian-main`) is the sole structural reference; no external
  research required. `research.md` will not be produced; pm reads `idea.md` as input.

## Epic context — claudian-reboot

Whole-plugin clean-room rewrite using Claudian (`D:\Projects\claudian-main`, MIT)
as the structural baseline, rebuilt in the established Vite/Vitest/Vue/DDD/ports
architecture. Decided 2026-05-24 via brainstorming. The existing shipped agent
surface (claude-cli-chat-sidebar → agent-sidepanel-v2/v3 → MPS → AUX) and the
spec-driven workflow engine are intentionally discarded on this line and regrown
on a cleaner base. Prior work stays intact on `develop` + git history.

Integration branch: `next` (off `develop`). Each phase below is its own `/spec`
cycle on a feature branch cut from + squash-merged into `next`. `next` → `develop`
only at parity.

| Phase | Scope |
|---|---|
| **P0** | **Shell reboot — this feature. Gut features, keep skeleton, boot empty agent sidebar.** |
| P1 | Chat core — provider-agnostic runtime + Claude CLI + streaming + single-thread chat (vertical slice) |
| P2 | Threads — tabs, history, fork/resume |
| P3 | Composer — slash (`/` `$`), @mention, instruction (`#`), plan mode |
| P4 | Approvals + inline edit + word-level diff |
| P5 | Providers — Codex, Opencode adapters |
| P6 | MCP client — stdio / SSE / HTTP |
| P7 | i18n — remaining locales |
| later | Workflow + lifecycle features regrow on the new base |

> **This P0–P7 table is COARSE and incomplete.** The authoritative feature/surface/
> visual inventory and the expanded phase map (P0–P12) live in the epic parity charter:
> `specs/claudian-reboot/parity-charter.md` (CHARTER-CLAUDIAN-REBOOT). The charter is a
> mandatory input to every phase's `/spec:design` + `/spec:review`. Goal = **1:1 Claudian
> experience (features + look/feel) within our constraints** — see the charter for what
> "1:1 within constraints" does and does not mean, and the per-surface screenshot parity
> acceptance method.

## Hand-off notes

```
2026-05-24 (brainstorming): Epic + P0 scoped via brainstorming dialogue. Decisions:
                          clean-room rewrite / whole plugin / Claudian-shaped /
                          keep skeleton, gut features / integration branch `next` /
                          runs through /spec lifecycle. P0 worktree created at
                          .worktrees/plugin-shell-reboot on feature/plugin-shell-reboot.
                          Next: /spec:idea (analyst) to firm up idea.md, then
                          requirements → design (file ADR-PSR-001) → spec → tasks.

2026-05-24 (analyst, Stage 1): idea.md refined + accepted (IDEA-PSR-001).
                          Research SKIPPED (Claudian is the sole reference; no
                          research.md). Validated Keep/Delete inventory against the
                          real src/ tree and corrected the seed: the bridges
                          (MockBridge, LocalStorageBridge) implement ChatTransportPort
                          + IconPort and import PluginSettings — they are NOT
                          core-only, so they need de-coupling. Resolved OQs:
                          OQ-PSR-1 = DEFER standalone build:web (ui/main.ts + router
                          wire FeatureService/FeatureRepository/CHAT_TRANSPORT_PORT/
                          SECRET_STORE_PORT, all deleted) — recommend a trivial empty
                          standalone entry to keep the gate green; flagged to PM.
                          OQ-PSR-2 = YES, prune required: port barrel (index.ts),
                          ports.ts InjectionKeys (drop ~10 + the @/domain/chat
                          imports), PluginSettings (drop chat/provider/MCP fields),
                          core-settings module, both bridges, fake-ports, and a near-
                          total rewrite of plugin/main.ts. EventBus EventMap is
                          already clean (empty declaration-merge target — no prune).
                          OQ-PSR-3 = KEEP a minimal settings tab over a slimmed
                          PluginSettings (can't delete it — SettingsPort/module/
                          migration depend on it); flagged whether to keep workflow
                          folder fields or drop to locale+logLevel.
                          NEW risks flagged forward: R-PSR-3 (CI triggers only
                          [develop,demo,main] — `next` gets NO CI; high/high),
                          R-PSR-4 (storybook + bundle-size gates not in local pre-PR
                          list), R-PSR-5 (coverage 80/70/80/80 may drop below
                          threshold on the gutted tree), R-PSR-6 (don't touch
                          manifest id/version/minAppVersion — intentional policy).
                          Carried forward Q1–Q5 with owners (pm/architect).
                          Next: /spec:requirements (pm) — resolve Q1–Q3 then write
                          EARS reqs; design files ADR-PSR-001 + the exact delete list.

2026-05-24 (pm, Stage 3): requirements.md written + accepted (PRD-PSR-001). 12
                          functional requirements (REQ-PSR-001..012, all `must`,
                          EARS w/ Given/When/Then) + 9 NFRs (NFR-PSR-001..009,
                          inherited from the actual verify/vitest/ci/manifest gate
                          definitions — no new thresholds; NFR-PSR-006 restates the
                          existing bundle-size budget). Success metrics include a
                          counter-metric: verify-gate bypasses MUST = 0.
                          Carried-forward questions resolved:
                          Q1 (build:web) = KEEP a trivial empty standalone entry on
                            the gate (REQ-PSR-011); do NOT drop build:web — preserves
                            the gate definition + browser-dev affordance, reversible.
                          Q2 (slim PluginSettings) = drop to `locale` + `logLevel`
                            ONLY (REQ-PSR-006/008); workflow folder/gate fields removed
                            because their consumer (workflow engine) is deleted.
                          Q3 (next-branch CI, R-PSR-3) = CI MUST cover `next` on push
                            + pull_request (REQ-PSR-012); mechanism = add `next` to the
                            CI trigger lists (workflow change → actionlint + SHA-pin
                            gate). Local-only verify rejected as sole guard. Exact
                            ci.yml edit deferred to design/impl.
                          Deferred to architect (design): Q4 (keep IconPort/<SpIcon>?)
                          and Q5 (exact file-by-file delete list + trimmed main.ts
                          shape) — recorded in the ## Clarifications block, NOT
                          resolved here. REQ-PSR-009 (ADR-PSR-001 body) + REQ-PSR-012
                          (ci.yml YAML) name design/impl as the trace owner.
                          No open question blocks acceptance.
                          Next: /spec:design (architect) — file ADR-PSR-001, resolve
                          Q4/Q5, produce the exact delete list + trimmed main.ts.

2026-05-24 (clarify gate, post-Stage-3): /spec:clarify ran inline (no subagent —
                          1M-context credit gate declined). 4 findings recorded in
                          requirements.md Clarifications. User-resolved 2 that amend
                          requirements: CL-1 = KEEP `locale` + a minimal i18n/
                          TranslationPort STUB that reads it (live consumer; i18n seam
                          survives for P7) — amends REQ-PSR-006; CL-2 = the
                          "no deleted-subsystem references" check is an AUTOMATED guard
                          (ESLint no-restricted-imports + CI test → durable TEST-PSR),
                          not manual — amends REQ-PSR-005. CL-3 (open affordance:
                          command vs ribbon) + CL-4 (Vue mount vs bare ItemView)
                          deferred to architect. Architect must honour CL-1/CL-2 in
                          design: keep the minimal translation seam; specify the
                          deleted-symbol ESLint rule + test seam.

2026-05-24 (architect, Stage 4): design.md written + complete (DESIGN-PSR-001).
                          ADR-PSR-001 FILED at docs/adr/ADR-PSR-001-reboot-plugin-shell.md
                          (status: accepted, matches ADR-008-<slug>.md convention) —
                          records the reboot, supersedes the feature-facing scope of
                          ADR-008 (IconPort + chat/MCP/canvas ports; six core ports
                          stay) + the MPS/AUX agent-surface features; keeps ADR-001/
                          003/004/009/010/011/012.
                          Decisions resolved:
                          Q4 (IconPort/<SpIcon>) = PRUNE both — empty view renders no
                            in-Vue icon; the tab icon is ItemView.getIcon():string
                            (native), not IconPort. Regrows in P1+ per consumer.
                          CL-3 (open affordance) = command-palette ONLY (one command
                            `open-agent-sidebar`), NO ribbon — satisfies REQ-PSR-003's
                            one-affordance rule with the smallest orphan-free surface.
                          CL-4 (Vue mount vs bare ItemView) = MOUNT VUE (AgentPanelRoot
                            inside ErrorBoundary, provide 6 core ports + i18n) — keeps
                            NFR-PSR-002 coverage of kept UI machinery, is the literal
                            seam P1 grows into, matches Claudian shape.
                          Slim settings = { locale, logLevel } only; coreSettingsModule
                            settingsVersion bumps to 4 with a strip-migrate; minimal
                            vue-i18n seam kept as locale's live consumer (CL-1).
                          Delete strategy (Q5): leaf-first, compiler-guided — 6 waves
                            (UI leaves → plugin views → application → infra adapters →
                            domain root → config/docs/guards), each ending typecheck-
                            green; `tsc` error list is the non-fabricated next-delete
                            set (R-PSR-1 mitigation). No hand-counted line totals.
                          CL-2 guard: new no-restricted-imports DELETED_SUBSYSTEM_BAN
                            in eslint.config.js + a Vitest test that lints src/** via
                            the ESLint Node API and asserts zero deleted-subsystem refs
                            (durable TEST-PSR-*, inside existing gate). Dead custom
                            rules (no-legacy-claude-cli-port-names + its override) get
                            deleted (NFR-PSR-009).
                          ci.yml (Q3): add `next` to push + pull_request branch lists —
                            only change; SHA-pin/actionlint-safe (no `uses:` touched).
                          build:web (Q1): trivial empty src/ui/main.ts mounting
                            AgentPanelRoot with MockBridge + 6 core ports; router/
                            FeatureService/secret-store/AppRoot deleted.
                          Flagged forward to spec/clarify (## Open clarifications):
                            OC-PSR-1 (ActiveFileSnapshot/Unsubscriber + WorkspacePort
                            chat-era extensions survival), OC-PSR-2 (LocalStorageBridge
                            standalone wiring — recommend always-MockBridge in P0),
                            OC-PSR-3 (verify docs/adr index filename + add ADR-PSR-001
                            row; add superseded-by pointers to ADR-008 + MPS/AUX ADRs —
                            bodies stay immutable, pointer fields only). None blocks
                            spec.
                          Next: /spec:specify (architect) — fix migration contract,
                          the DELETED_SUBSYSTEM_BAN glob list (verify each path
                          resolves), the guard-test lint-API contract, view/command/
                          settings-tab signatures, and the WorkspacePort shape (OC-PSR-1).

2026-05-24 (clarify gate, post-Stage-4): /spec:clarify ran inline (no subagent —
                          1M-context credit gate declined). Verdict: design SOUND, no
                          blocking clarifications. OC-PSR-1..3 are spec-author
                          verification tasks (not user-intent forks); all accepted with
                          the architect's recommended defaults: OC-PSR-1 = revert
                          WorkspacePort to ADR-008 openFile-only, drop chat-era
                          extensions unless a kept consumer remains; OC-PSR-2 = P0
                          standalone always MockBridge, defer GitHub-Pages demo
                          (consistent with the already-approved defer-standalone /
                          OQ-PSR-1 posture); OC-PSR-3 = verify docs/adr index filename +
                          add superseded-by pointers (mechanical). Migration contract
                          confirmed = STRIP-on-read (architect recommendation) so
                          REQ-PSR-005 holds for the persisted blob. spec author pins all.

2026-05-24 (architect, Stage 5): spec.md written + complete (SPEC-PSR-001). 17
                          spec items (SPEC-PSR-001..017) + 23 test scenarios
                          (TEST-PSR-001..023: 15 unit, 3 automated guard/arch,
                          5 manual Obsidian for NFR-PSR-003). Key contracts pinned:
                          MIGRATION (SPEC-PSR-002) = strip-on-read, idempotent,
                            version-agnostic (fromVersion ignored). settingsVersion
                            3→4. migrate projects any blob → {locale,logLevel} only;
                            validateSettings coerces locale (coerceString) + logLevel
                            (coerceEnum/VALID_LOG_LEVELS). Edge table covers
                            already-v4 / pre-versioned-v0.x-fat / null / corrupt /
                            partial / invalid-value / idempotency. All other coercion
                            helpers + VALID_* + @/domain/chat imports deleted.
                          WORKSPACEPORT (SPEC-PSR-009, OC-PSR-1) = reverted to ADR-008
                            openFile-only. Verified the only KEPT consumer is
                            useWorkspacePort.ts (passthrough); empty AgentPanelRoot
                            calls nothing. Dropped getActiveFile*/onActiveFileChanged/
                            getActiveFilePath/getActiveSelection/getVaultName/
                            getMarkdownFileCount + ActiveFileSnapshot. CORRECTION to
                            design §C.5: ObsidianBridge ALSO carries ChatTransportPort
                            + IconPort (confirmed in source) — it must be de-coupled
                            in Wave 3 too, not just Mock/LocalStorage. Unsubscriber
                            kept in barrel (MAY drop if zero kept importers — not
                            required, not an NFR-PSR-009 violation).
                          GUARD TEST (SPEC-PSR-013/014, TEST-PSR-016) = ESLint Node
                            API (new ESLint(), lintFiles(['src/**/*.ts','src/**/*.vue']),
                            errorOnUnmatchedPattern:true) asserting zero
                            no-restricted-imports msgs carrying the DELETED_SUBSYSTEM_BAN
                            fragment. DELETED_SUBSYSTEM_BAN expanded to one glob per
                            prefix (brace-form collapsed for auditability) + a paths
                            entry banning the 14 deleted InjectionKey importNames from
                            @/infrastructure/bridge/ports. Dead custom rule
                            no-legacy-claude-cli-port-names + .cjs + __tests__ +
                            lint:rules half + useClaudeCliPort override DELETED
                            (NFR-PSR-009); no-claude-home-reads KEPT.
                          AGENT SURFACE: VIEW_TYPE_AGENT='specorator-agent';
                            AgentSidebarView(ItemView) mounts AgentPanelRoot inside
                            ErrorBoundary via createApp+h, provides 6 core ports,
                            getIcon()='bot' (native Lucide, not IconPort); onClose
                            unmounts. AgentPanelRoot data-testid="agent-panel-empty",
                            reads agent.empty.placeholder. One command
                            'open-agent-sidebar' + activateAgentSidebar reveal-or-create
                            with loadIfDeferred (deferred-leaf invariant). Slim
                            SpecoratorSettingTab keeps only the module-schema loop.
                          i18n (CL-1): index.ts kept in shape; catalogues trimmed to
                            the single agent.empty.placeholder key (en+de); locale
                            narrowed via toSupportedLocale (fr→en) at all 3 setLocale
                            sites (main.ts, view.onOpen, ui/main.ts) — fixes the
                            string→SupportedLocale gap that no-unsafe-argument would
                            reject.
                          STANDALONE (OC-PSR-2): src/ui/main.ts always MockBridge;
                            LocalStorageBridge kept as compiling 6-port class, NOT
                            referenced; GitHub-Pages demo deferred.
                          ci.yml (SPEC-PSR-015): add `next` to push+pull_request branch
                            lists only; SHA-pin/actionlint-safe (no `uses:` touched).
                          FLAGGED TO PLANNER (## Open clarifications, none blocking):
                            OC-PSR-4 (verify ALL_MODULES/helloModule shape — trim to
                            [coreSettingsModule, helloModule]); OC-PSR-5 (confirm
                            @/infrastructure/mcp/** + @/application/migration/** globs
                            resolve to real deleted paths during Wave 2/3 — drop any
                            dead glob per NFR-PSR-009; MCP registrars may be under
                            ObsidianMcp* instead); OC-PSR-6 (reuse existing ESLint-API
                            harness in tests/lint/** if present, else create new file);
                            OC-PSR-7 (confirm ErrorBoundary.vue survives Wave 0 in
                            place — empty view mounts inside it). OC-PSR-3 (ADR index
                            row + superseded-by pointers) folded into §9 as a
                            mechanical planner task note.
                          Next: /spec:tasks (planner) — decompose into T-PSR-* keyed to
                          the 6 delete waves + the surviving contracts; resolve OC-PSR-4..7
                          as verification subtasks.

2026-05-24 (planner, Stage 6): tasks.md written + complete (TASKS-PSR-001). 34 tasks
                          (T-PSR-001..034) in 4 phases: A) stand up the surviving
                          surface + RED tests (slim PluginSettings/core-settings/
                          migration, AgentPanelRoot, AgentSidebarView, slim main.ts +
                          settings tab, WorkspacePort revert, i18n trim +
                          toSupportedLocale, standalone entry); B) six delete waves
                          0→5 (T-PSR-017..023), each ending `npm run typecheck`
                          green-or-expected (R-PSR-1 mitigation), Wave 3b de-couples
                          ALL THREE bridges incl. ObsidianBridge (Stage-5 correction);
                          C) deleted-symbol guard enabled LAST (T-PSR-026 rule +
                          T-PSR-027 arch test) once every ban glob resolves to a real
                          removed path (NFR-PSR-009); D) ci.yml `next`, docs rewrite,
                          ADR-index housekeeping, coverage check, final verify gate.
                          CRITICAL PATH: T-002→003→004→008→009→017→018→019→020→021→
                          022→023→026→027→032→034 — the 6 waves are the spine; the
                          guard is downstream of the last delete by design.
                          All 23 TEST-PSR mapped: 15 unit (Vitest+fake-ports/PageObject),
                          3 automated arch/guard (TEST-PSR-016/017/023), 5 manual
                          Obsidian (TEST-PSR-018..021 + ribbon enum) flagged as the
                          dev/human manual-verification task T-PSR-033 (NFR-PSR-003,
                          not CI-automatable).
                          OC placement (none floating): OC-PSR-4 (ALL_MODULES/
                          helloModule) → T-PSR-008; OC-PSR-5 (mcp/migration glob
                          resolution) → T-PSR-019/020 findings feed T-PSR-026 pruning;
                          OC-PSR-6 (reuse ESLint-API harness) → T-PSR-024 recon before
                          T-PSR-027; OC-PSR-7 (ErrorBoundary survives Wave 0) →
                          T-PSR-017 keep-and-verify subtask. OC-PSR-3 (ADR index +
                          superseded-by) → T-PSR-031. Explicit tasks for
                          toSupportedLocale (T-PSR-007), 3-bridge de-couple +
                          ports.ts/fake-ports trim (T-PSR-021), docs rewrite (T-PSR-030),
                          coverage threshold + R-PSR-5 contingency (T-PSR-032), and the
                          feature-DoD verify-with-zero-bypasses gate (T-PSR-034).
                          No blocking open question; two held sequencing notes in
                          tasks.md ## Open questions (RED tests won't compile until the
                          slim rewrite removes the chat import — intended; and
                          green-or-expected = tsc errors trace only to not-yet-deleted
                          importers, a kept-file error is a scope-escalation signal).
                          FIRST READY TASK (dev): none blocked — Batch 1 is all-parallel
                          RED/recon tasks. First qa-owned ready task: T-PSR-001 (RED
                          migration tests). First dev-owned ready task after Batch 1:
                          T-PSR-003 (slim PluginSettings, blocked only by T-PSR-002).
                          Next: /spec:implement — dev/qa pick up Batch 1.

2026-05-24 (analyze gate, post-Stage-6): /spec:analyze ran inline (no subagent —
                          1M-context credit gate declined). Verdict: CONSISTENT.
                          Full traceability confirmed — every REQ-PSR-001..012,
                          NFR-PSR-001..009, SPEC-PSR-001..017 and all 23 TEST-PSR map
                          to tasks (tasks.md coverage table); chain REQ→SPEC→TEST→Task
                          intact; dependency graph + critical path coherent; guard
                          correctly sequenced after the last delete. ONE non-blocking
                          finding: design §C.5 prose still says "ObsidianBridge
                          implements exactly six ports" — stale/optimistic, superseded
                          by SPEC-PSR-009 + T-PSR-021 (ObsidianBridge also carries
                          ChatTransportPort+IconPort; de-coupled in Wave 3b). Downstream
                          artifacts are correct; only the design prose is out of date.
                          Recommend the dev annotate §C.5 (or leave as-is since spec is
                          authoritative). No requirement/spec/task orphans; no
                          contradictions. idea→tasks scope COMPLETE — P0 ready for
                          implementation (Stage 7, T-PSR-001 first).

2026-05-24 (pm, Stage 3 — settings/secret amendment): TWO new user requirements
                          arrived from the updated parity charter
                          (specs/claudian-reboot/parity-charter.md §1 bounding
                          constraints) and were appended to requirements.md
                          (status stays ACCEPTED — scoped amendment, not a rewrite):
                          REQ-PSR-013 (must, event-driven, CHARTER-REQ-SET): P0's
                            user/device-scoped settings (`locale`, `logLevel`) persist
                            to a DEVICE-LOCAL store outside `data.json` (Obsidian
                            app.loadLocalStorage/saveLocalStorage, device-scoped + not
                            synced, or a gitignored device-local file), NOT `data.json`
                            (which is git-committed + shared on collaborative vaults).
                            Includes a one-time legacy `data.json`→device-local
                            migrate-and-clear so old shared blobs stop being committed.
                            `SettingsPort` CONTRACT UNCHANGED — only its ObsidianBridge
                            backing store moves; re-points REQ-PSR-006/007/008
                            persistence (fields still {locale,logLevel}). Acceptance is
                            testable: after save, `data.json` has no locale/logLevel +
                            value round-trips through the device-local store.
                          REQ-PSR-014 (must, unwanted-behaviour, CHARTER-REQ-SEC):
                            secrets MUST use Obsidian native secret storage
                            (`app.secretStorage`, vault-keyed local storage outside
                            `data.json`) behind a `SecretStorePort`, never `data.json`
                            (rejecting Claudian's raw-key-in-JSON approach). SCOPED AS A
                            P0-VACUOUS inherited epic constraint: P0 introduces NO secret
                            (no API keys until providers in P1+), stores none, writes
                            none to `data.json`, and in fact deletes the prior
                            SECRET_STORE_PORT/SECRET_ID_* surface (SPEC-PSR-013). The
                            `SecretStorePort` is introduced when the first secret lands
                            (P1+). No P0 secret surface invented.
                          NFRs added: NFR-PSR-010 (data-hygiene regression guard — after
                            a save, `data.json` settings slice has NO locale/logLevel;
                            value reads back from device-local store) and NFR-PSR-011
                            (compatibility — verify the device-local API is supported at
                            `minAppVersion 1.12.7`; FLAG: `app.secretStorage` availability
                            at 1.12.7 is UNCONFIRMED — verify before P1 secret surface,
                            escalate vs silent manifest bump per NG6/R-PSR-6). Success
                            metrics + release criteria updated to match.
                          DOWNSTREAM DELTAS flagged (CL-5..CL-9, requirements.md
                          Clarifications — PM did NOT design them):
                            CL-5 → architect: ObsidianBridge `SettingsPort` backing store
                              re-points to app.loadLocalStorage/saveLocalStorage (design
                              §C.6 line ~238 saveData(this._storedData) must move off
                              `data.json`); SPEC-PSR-008 settings persistence touched.
                            CL-6 → architect: SPEC-PSR-002 migration ALSO clears the legacy
                              `data.json` settings slice after relocating to device-local
                              (one-time, idempotent — project then relocate then clear).
                            CL-7 → architect: file NEW ADR-PSR-002 (settings storage
                              location + `data.json`→device-local migration + the
                              minAppVersion API-availability check). P0-relevant, filed in
                              P0 per charter §6a.
                            CL-8 → architect (P1, NOT P0): `SecretStorePort` ADR DEFERRED
                              to P1 (first secret = Claude key); confirm app.secretStorage
                              at minAppVersion before that surface lands.
                            CL-9 → planner: add (a) the NFR-PSR-010 regression-guard test
                              (no locale/logLevel in `data.json` after save + round-trip)
                              and (b) the one-time migrate-and-clear test (idempotent);
                              extend the SPEC-PSR-002 migration cluster (T-PSR-001..004)
                              and the bridge re-point (T-PSR-021) — no new delete wave; no
                              P0 task for REQ-PSR-014 (vacuous), only a trace to the
                              deferred P1 SecretStorePort ADR.
                          requirements.md stays status: accepted. Workflow re-enters at
                          Stage 3 for the amendment; architect must re-touch design
                          §C.3/§C.6 + SPEC-PSR-002 and file ADR-PSR-002 before the spec
                          returns to `complete`.
                          Next: /spec:design (architect) — process CL-5..CL-8, re-point
                          the SettingsPort backing store, extend the migration contract,
                          file ADR-PSR-002; then planner picks up CL-9.

2026-05-24 (architect, Stage 4/5 — settings-storage delta): processed CL-5/CL-6/CL-7
                          (settings/secret amendment). design.md + spec.md stay
                          `complete`; this is a scoped delta, not a rewrite.
                          SETTINGSPORT RE-POINT (CL-5, design §C.16 + §C.6,
                            SPEC-PSR-008): ObsidianBridge getSettings/saveSettings move
                            off data.json (loadData/saveData) onto Obsidian's
                            device-local store (app.loadLocalStorage/saveLocalStorage,
                            stable key `specorator:settings`, device-scoped + NOT
                            synced). SettingsPort CONTRACT UNCHANGED + PluginSettings
                            shape unchanged ({locale,logLevel}). main.ts §C.6: the
                            onload `saveData(this._storedData)` SETTINGS write is
                            DROPPED — settings persist via bridge.saveSettings only;
                            _storedData/saveData has no remaining P0 settings consumer
                            (dropped unless a non-settings module needs the round-trip —
                            verify helloModule, OC-PSR-4). Three-bridge story (§C.3b):
                            MockBridge in-memory (unchanged), LocalStorageBridge
                            web-localStorage (unchanged), only ObsidianBridge moves.
                          MIGRATE-AND-CLEAR (CL-6, design §C.3a, SPEC-PSR-002a): one-time
                            project → relocate → clear on first loadSettings(). Project =
                            reuse coreSettingsModule.migrate strip (SPEC-PSR-002) →
                            {locale,logLevel}; Relocate = seed device-local ONLY if empty
                            (device-local WINS when both populated); Clear = delete the
                            data.json settings slice so old shared blobs stop being
                            committed. Idempotent; edge table pinned (legacy present /
                            already migrated / both populated [device-local wins] / both
                            empty / second-run no-op / device-local API unavailable →
                            escalate per NFR-PSR-011/NG6, ADR-PSR-002 Option C fallback).
                          ADR-PSR-002 FILED (CL-7) at
                            docs/adr/ADR-PSR-002-settings-storage-device-local.md
                            (status: accepted; matches ADR-PSR-001 format). Records the
                            device-local backing-store choice (rationale = collaborative
                            git-backed/synced vaults must not carry per-device prefs), the
                            migrate-and-clear contract, and the minAppVersion 1.12.7 API
                            check (NFR-PSR-011). Forward pointer ONLY for secrets:
                            SecretStorePort/app.secretStorage ADR DEFERRED to P1 — not
                            folded in. Added to design.md + spec.md `adrs:` frontmatter.
                          NEW TESTS: TEST-PSR-024 (NFR-PSR-010 data-hygiene — after save,
                            data.json has no locale/logLevel + value round-trips
                            device-local) and TEST-PSR-025 (relocate-and-clear, idempotent).
                            TEST-PSR set now 25 (was 23): 17 unit, 3 arch/guard, 5 manual.
                            Edges E13/E14 added to SPEC-PSR-018. NFR-PSR-011 is an
                            impl-time API-availability recon step, not a discrete
                            automated test.
                          CL-8 (SecretStorePort ADR → P1) + CL-9 (planner tasks) left
                            as-is — not architect's to close here.
                          PLANNER MUST ADJUST (CL-9): extend the SPEC-PSR-002 migration
                            cluster (T-PSR-001..004) with SPEC-PSR-002a's migrate-and-clear
                            (RED test for TEST-PSR-025); extend the bridge re-point
                            (T-PSR-021) so ObsidianBridge.getSettings/saveSettings target
                            app.loadLocalStorage/saveLocalStorage (key
                            `specorator:settings`), NOT loadData/saveData, and add the
                            TEST-PSR-024 data-hygiene RED test; adjust the slim-main.ts
                            task to DROP the onload settings saveData write + run the
                            migrate-and-clear in loadSettings(); add an impl recon subtask
                            to verify app.loadLocalStorage/saveLocalStorage at
                            minAppVersion 1.12.7 (NFR-PSR-011, escalate per NG6 if absent).
                            NO new delete wave; NO P0 task for REQ-PSR-014 (vacuous) —
                            only a trace to the deferred P1 SecretStorePort ADR. (NOTE:
                            no docs/adr index file [README.md/index.md] exists in this
                            worktree — OC-PSR-3's "add the ADR-PSR-001 row" task should
                            CREATE the index or be re-scoped; ADR-PSR-002 likewise has no
                            index row to add yet.)
                          Next: /spec:tasks (planner) — fold CL-9 into the existing
                          T-PSR-* cluster (migration + bridge re-point + slim-main.ts);
                          no stage regression beyond the amendment.

2026-05-24 (pm, Stage 3 — no-backwards-compat simplification): NEW epic constraint
                          CHARTER-REQ-FRESH (specs/claudian-reboot/parity-charter.md):
                          complete rewrite, NO backwards compatibility. This REMOVES
                          migration work — it does not add scope. requirements.md edits
                          (status stays ACCEPTED — scoped simplification):
                          - NG8 added: no backwards compatibility, complete rewrite; no
                            migration of legacy data.json/settings/sessions, no compat
                            shims/deprecated-field handling, no version-bump migrations.
                          - REQ-PSR-013 TRIMMED: dropped the one-time legacy data.json
                            read-migrate-and-clear clause. New shape: device-scoped
                            settings (locale, logLevel) persist to a device-local store,
                            never data.json; on first run with no stored settings the
                            plugin uses DEFAULT_SETTINGS (load-or-default), NO migration.
                            Kept the data.json-hygiene acceptance (after a save, data.json
                            carries no locale/logLevel) + round-trip. Traces re-pointed
                            off SPEC-PSR-002a/TEST-PSR-025 onto SPEC-PSR-002 (load-or-
                            default) + TEST-PSR-024.
                          - NFR-PSR-010 (hygiene) KEPT. NFR-PSR-011 keeps only the
                            device-local API check at minAppVersion 1.12.7 + the deferred
                            secret-storage-API check (P1).
                          - Success metrics + release criteria: dropped the migrate-and-
                            clear-ran criterion; kept the data.json-hygiene + round-trip
                            check; added the load-or-default (no migration) note.
                          - Clarifications: replaced the migration CLs (CL-5/CL-6/CL-7/
                            CL-9) with a single CL-FRESH. CL-8 (SecretStorePort → P1) kept.
                          DOWNSTREAM DELTAS (CL-FRESH):
                            ARCHITECT: drop SPEC-PSR-002 strip-migration + SPEC-PSR-002a
                              relocate-and-clear + TEST-PSR-025; simplify SPEC-PSR-002 /
                              TEST-PSR-001..004 to load-or-default + hygiene. ADR-PSR-002:
                              drop the migration section, keep the device-local decision.
                            PLANNER: drop the migration tasks/tests; keep the device-local
                              re-point (T-PSR-021) + the data.json-hygiene test (TEST-PSR-024).
                          requirements.md stays status: accepted. Workflow re-enters at
                          Stage 3 for this simplification; architect + planner re-touch
                          spec/tasks/ADR-PSR-002 to remove the migration surface before
                          spec/tasks return to `complete`.
                          Next: /spec:design (architect) — process CL-FRESH (drop the
                          migration surface); then planner removes migration tasks/tests.

2026-05-24 (architect, no-backwards-compat simplification): processed CL-FRESH
                          (CHARTER-REQ-FRESH / NG8). design.md + spec.md stay
                          `complete`; ADR-PSR-002 amended in place. MIGRATION SURFACE
                          REMOVED — device-local backing store kept intact.
                          SPEC-PSR-002 = LOAD-OR-DEFAULT: coreSettingsModule has NO
                            migrate() and NO settingsVersion bump; on load, read the
                            device-local blob and validate→coerce, else DEFAULT_SETTINGS.
                            validateSettings (coerce locale via coerceString, logLevel
                            via coerceEnum/VALID_LOG_LEVELS) stays; unknown keys ignored.
                          DELETED: SPEC-PSR-002a (relocate-and-clear migration) and
                            TEST-PSR-025 (relocate-and-clear test). Edge E14 removed.
                          SIMPLIFIED TEST-PSR-001..004: 001 = load-or-default
                            (null/undefined → DEFAULT_SETTINGS), 002 = no migrate method
                            + no settingsVersion bump, 003 = unknown-key hygiene
                            ({...,specsFolder} → {locale,logLevel}), 004 = corrupt
                            non-object → defaults. TEST-PSR-005 (validateSettings coerce)
                            + TEST-PSR-024 (data.json hygiene after save) KEPT.
                            Total TEST-PSR = 24 (was 25): 16 unit, 3 arch/guard, 5 manual.
                          KEPT (survive, no migration step): SPEC-PSR-008/016 device-local
                            re-point (app.loadLocalStorage/saveLocalStorage, key
                            `specorator:settings`); main.ts loadSettings() = load-or-default
                            (no migrate call, no legacy data.json read); onload does NOT
                            saveData settings. §12/§13 + edge tables updated (E13 kept,
                            E14 dropped). NFR-PSR-011 device-local API check at 1.12.7 kept.
                          design.md: §C.3 = load-or-default (no migrate, no settingsVersion);
                            §C.3a relocate-and-clear REPLACED with "device-local + load-or-
                            default, no migration (CHARTER-REQ-FRESH)" note; §C.6 loadSettings
                            = read device-local or default; §C.2/§C.11/§C.13/§C.16 fixed.
                          ADR-PSR-002: amended in place (frontmatter `amended` note +
                            Context/Decision/Options/Consequences/Compliance/References) —
                            migration section dropped, device-local + load-or-default kept,
                            minAppVersion 1.12.7 API check kept. Amended (not superseded)
                            because not yet downstream-consumed/implemented.
                          requirements.md: CL-FRESH marked RESOLVED-in-design.
                          PLANNER TASK DELTAS (tasks.md, T-PSR-*): DROP the SPEC-PSR-002a
                            migrate-and-clear task + its RED TEST-PSR-025 test from the
                            migration cluster (T-PSR-001..004); RE-SCOPE T-PSR-001..004 to
                            load-or-default + coerce + no-migration + unknown-key hygiene
                            (4 simplified RED tests for SPEC-PSR-002/003 → TEST-PSR-001..005);
                            KEEP T-PSR-021 (3-bridge de-couple + ObsidianBridge device-local
                            re-point to app.loadLocalStorage/saveLocalStorage) and its
                            TEST-PSR-024 data.json-hygiene RED test; ADJUST the slim-main.ts
                            task so loadSettings() is load-or-default (NO migrate-and-clear
                            call, NO legacy data.json read) and onload drops the settings
                            saveData write; KEEP the NFR-PSR-011 impl recon subtask (verify
                            app.loadLocalStorage/saveLocalStorage at minAppVersion 1.12.7,
                            escalate per NG6 if absent). No new delete wave; no new tasks —
                            net removal. Re-run /spec:analyze trace check after the tasks.md
                            edit (TEST-PSR-025 must no longer appear in the coverage table).
                          Next: /spec:tasks (planner) — remove the migration task/test from
                          the T-PSR-* cluster; spec/design already `complete`.

2026-05-24 (planner, no-backwards-compat simplification): tasks.md re-scoped per
                          CL-FRESH (CHARTER-REQ-FRESH / NG8). tasks.md stays `complete`.
                          NET REMOVAL — no new tasks, no new delete wave. Task count
                          UNCHANGED at 34 (T-PSR-001..034); critical path UNCHANGED.
                          DROPPED: the SPEC-PSR-002a migrate-and-clear content + the RED
                          TEST-PSR-025 test from the T-PSR-001..004 cluster (no longer
                          referenced anywhere in tasks.md).
                          RE-SCOPED T-PSR-001 → load-or-default + unknown-key hygiene +
                          no-migration assertions (no `migrate`, no `settingsVersion`
                          bump); T-PSR-004 → load-or-default `validateSettings` + 2-field
                          schema, no migrate/strip/version. Removed every
                          migrate()/settingsVersion/strip/relocate reference.
                          T-PSR-008 (slim main.ts) ADJUSTED: `loadSettings()` =
                          load-or-default via `bridge.getSettings()` (no migrate-and-clear
                          call, no legacy data.json read); `onload` drops the settings
                          `saveData` write; NFR-PSR-011 device-local API recon subtask
                          (verify app.loadLocalStorage/saveLocalStorage at minAppVersion
                          1.12.7; escalate per NG6 if absent) KEPT.
                          T-PSR-021 (Wave 3b) KEPT + made explicit: 3-bridge de-couple +
                          ObsidianBridge SettingsPort device-local re-point
                          (app.loadLocalStorage/saveLocalStorage, key
                          `specorator:settings`, never data.json) + its TEST-PSR-024
                          data.json-hygiene RED test (now qa→dev tracked).
                          COVERAGE TABLE updated: no TEST-PSR-025; 24 TEST-PSR mapped
                          (001..004→T-PSR-001 load-or-default cluster, 005..007→T-PSR-002,
                          024→T-PSR-021); added REQ-PSR-013/NFR-PSR-010/NFR-PSR-011 rows;
                          T-PSR-001..004 map to REQ-PSR-013 (load-or-default) + REQ-PSR-006/008.
                          /spec:analyze trace re-check recommended (TEST-PSR-025 no longer
                          appears in the coverage table).
                          FIRST READY TASK (qa): T-PSR-001 (RED load-or-default tests).
                          First dev-owned ready task after Batch 1: T-PSR-003 (slim
                          PluginSettings, blocked only by T-PSR-002).
                          Next: /spec:implement — dev/qa pick up Batch 1.

2026-05-24 (dev, Stage 7 — P0 IMPLEMENTED): all 34 T-PSR done across Phases A–D
                          (surviving surface → 6 delete waves → guard → ci/docs/
                          coverage/gate), one Conventional commit per task on
                          feature/plugin-shell-reboot. `npm run verify` exits 0
                          (typecheck/lint/lint:style-tokens/test:coverage[308 tests,
                          94.5/85/87/94.7]/build/build:web/verify:bundle-size/docs:api/
                          validate:manifest/verify:scaffold/verify:workflows/diff-check);
                          zero bypasses (counter-metric=0); manifest id/version/
                          minAppVersion unchanged (NFR-PSR-007); deleted-subsystem guard
                          GREEN (TEST-PSR-016/017). Plugin boots one empty agent sidebar.
                          THREE flags for the maintainer (impl-log details):
                          (1) PluginCore MCP surface trimmed — compiler-surfaced spec gap
                          (design §C.14 didn't enumerate it; MCP is a deleted subsystem).
                          (2) OC-PSR-3: no standalone ADR-MPS/AUX files — feature-surface
                          supersession recorded in docs/adr/README.md, not per-file
                          frontmatter. (3) Settings device-local re-point (T-021 slice)
                          pulled forward into T-008 to keep main.ts non-recursive.
                          PENDING HUMAN (never self-claimed): test:storybook + CI green on
                          `next` (needs Chromium/CI); manual Obsidian checks
                          TEST-PSR-018..021 (test-report.md). Next: open draft PR
                          feature/plugin-shell-reboot → next; CHECKPOINT before P1.
```
