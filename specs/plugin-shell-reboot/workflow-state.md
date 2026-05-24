---
feature: Plugin shell reboot (P0 — Claudian-shaped rewrite foundation)
area: PSR
slug: plugin-shell-reboot
current_stage: idea
status: active
last_updated: 2026-05-24
last_agent: analyst (Stage 1)
epic: claudian-reboot
phase: P0
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: complete
  research.md: skipped
  requirements.md: pending
  design.md: pending
  spec.md: pending
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
  test-report.md: pending
  review.md: pending
  release-notes.md: pending
  retrospective.md: pending
adrs:
  - ADR-PSR-001 (to file in design) — reboot supersedes ADR-008 feature-port scope + MPS/AUX agent surface
---

# Workflow state — plugin-shell-reboot (P0)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | complete |
| 2. Research | `research.md` | skipped (Claudian source is the sole reference) |

## Skips

- Stage 2 (Research) — skipped per Standard-depth decision. Claudian
  (`D:\Projects\claudian-main`) is the sole structural reference; no external
  research required. `research.md` will not be produced; pm reads `idea.md` as input.
| 3. Requirements | `requirements.md` | pending |
| 4. Design | `design.md` | pending |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

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
```
