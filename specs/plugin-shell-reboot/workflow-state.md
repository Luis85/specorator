---
feature: Plugin shell reboot (P0 — Claudian-shaped rewrite foundation)
area: PSR
slug: plugin-shell-reboot
current_stage: tasks
status: active
last_updated: 2026-05-24
last_agent: planner (Stage 6)
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
  implementation-log.md: pending
  test-plan.md: pending
  test-report.md: pending
  review.md: pending
  release-notes.md: pending
  retrospective.md: pending
adrs:
  - id: ADR-PSR-001
    path: docs/adr/ADR-PSR-001-reboot-plugin-shell.md
    status: accepted
    note: reboot supersedes the feature-facing scope of ADR-008 + the MPS/AUX agent surface
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
```
