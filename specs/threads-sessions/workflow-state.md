---
feature: threads-sessions
area: TS
current_stage: requirements
status: active
last_updated: 2026-05-25
last_agent: orchestrator (P3 bootstrap)
epic: claudian-reboot
phase: P3
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (charter §3.2 + audits + claudian-main stand in, mirrors P1/P2)
  research.md: skipped (charter §3.2 + audits + claudian-main stand in)
  requirements.md: pending
  design.md: pending
  spec.md: pending
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — threads-sessions (P3)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | pending |
| 4. Design | `design.md` | pending |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P3 (tabs / sessions / history)

P0 #432, P1 chat-core #433, P2 rich-rendering #436 merged to `next`. P3 = the third vertical
slice: **multi-tab chat + conversation persistence + resume/fork/rewind/compact + title-gen** on
the P1/P2 chat surface.

**Scope (charter §4 P3 row + §3.2):**
- **Multi-tab chat** (`TabBar`, `TabManager`, `Tab`, `tabs/types.ts`, `tabs/providerResolution.ts`)
- **Conversation history + resume** (`ResumeSessionDropdown`, per-provider history stores —
  `ClaudeConversationHistoryService`, `ClaudeHistoryStore`, `sdkHistoryTypes`)
- **Fork** a conversation (`ForkTargetModal`, `rewind.ts`, `ClaudeRewindService`)
- **Rewind / checkpoint** to an earlier turn
- **Compact** a conversation + **auto title generation** (`titleGeneration`,
  `ClaudeTitleGenerationService`, `QueryBackedTitleGenerationService`)
- CSS: `tabs.css`, `history.css`, `resume-session.css`, `fork-target.css`, nav-sidebar

**Out of P3 (later phases):** composer power slash/@mention/instruction/plan/bang-bash (P4);
approvals/inline-interactive (P7); attachments (later); Codex/Opencode providers (P9 — P3 builds
the per-provider history/title SEAMS but wires only Claude); MCP (P8); settings-UX shell (P10).

**Key P3 ADR decisions to make (autonomous — record each):**
- **Conversation-history persistence location.** History transcripts are neither a secret nor a
  device-pref. Decide: vault files (portable, user-visible, git-trackable) vs device-local vs a
  dedicated store — under the epic constraints (secrets→secretStorage; device/user settings→
  device-local; NO data.json for settings). Claudian uses per-provider history stores. File an ADR.
- **Thread/tab state model** — Pinia multi-thread store (DTO-only) replacing the P1 single-thread
  `chatStore`; how the per-tab `ChatRuntime` + history bind. (Router regrows IF needed — CLAUDE.md
  notes Vue Router was removed in P0; multi-tab may not need routing, just tab state.)
- **Rewind/fork semantics** — how `rewind.ts`/`ClaudeRewindService` map onto our `ChatRuntimePort`
  (`resetSession`/resume + the rewind checkpoint model); the new ports the backend audit names.
- **Title generation** — the `QueryBackedTitleGenerationService` seam (a side query) on the port.

**Epic constraints (every phase):** secrets→`app.secretStorage` behind `SecretStorePort`, never
`data.json`; device/user settings→device-local; NO backwards compat (load-or-default); DDD inward
imports + narrow ports + 3 bridges; Vue never imports `obsidian`; no `innerHTML`/`v-html`/
`window.confirm` (Obsidian `Modal` for fork-target etc.); `<script setup>`; `Result<T,E>`; tests
mirror `src/` + `data-testid` PageObjects; coverage 80/70/80/80; perceptual parity via `--sp-*`;
identity stays Specorator; WCAG 2.2 AA; manifest untouched; CI SHA-pinned + actionlint. VERIFY GATE
(`npm run verify` + `npm run test:all` exit zero).

**Operating mode (human directive 2026-05-25):** AUTONOMOUS DRIVE — no per-phase human checkpoint;
self-parity-review vs claudian after each big chunk; merge P3 to `next` autonomously; manual-Obsidian
+ parity-screenshot legs accumulate for the SINGLE FINAL human review gate.

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.2/§4/§5/§6 +
`claudian-audit-{frontend,backend}.md` + `D:\Projects\claudian-main` (the §3.2 sources:
`features/chat/tabs/*`, `features/chat/rewind.ts`, `shared/components/ResumeSessionDropdown.ts`,
`shared/modals/ForkTargetModal.ts`, `providers/claude/history/*`, `providers/claude/runtime/ClaudeRewindService.ts`,
`core/prompt/titleGeneration.ts`, `core/auxiliary/QueryBackedTitleGenerationService.ts`).

## Hand-off notes

```
2026-05-25 (orchestrator): P3 bootstrapped on feature/threads-sessions (off next; P0/P1/P2 merged).
                          Scope = charter §4 P3 / §3.2 (tabs/history/resume/fork/rewind/compact/
                          title-gen). Autonomous drive. Next: /spec:requirements (pm) grounded in
                          charter §3.2 + audits + the claudian §3.2 sources; then design A/B/C with
                          the P3 ADRs (history persistence location; multi-thread store model;
                          rewind/fork semantics + new ports; title-gen seam). EARS reqs each mapped
                          to a claudian path + test.
```
