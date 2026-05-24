---
feature: Plugin shell reboot (P0 — Claudian-shaped rewrite foundation)
area: PSR
slug: plugin-shell-reboot
current_stage: design
status: active
last_updated: 2026-05-24
last_agent: architect (Stage 4)
epic: claudian-reboot
phase: P0
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: complete
  research.md: skipped
  requirements.md: complete
  design.md: complete
  spec.md: pending
  tasks.md: pending
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
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
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
```
