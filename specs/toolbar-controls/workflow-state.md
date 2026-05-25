---
feature: toolbar-controls
area: TC
current_stage: requirements
status: active
last_updated: 2026-05-25
last_agent: orchestrator (bootstrap)
epic: claudian-reboot
phase: P6
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.5/§4 P6 + audits + claudian-main stand in, mirrors P1-P5)
  research.md: skipped
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

# Workflow state — toolbar-controls (P6)

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

## Epic context — claudian-reboot P6 (toolbar & controls)

P0-P5 merged to `next` (P5 context-attachments #446 / squash 6d6b1a6). P6 = the **input
toolbar control strip** on the P1-P5 composer.

**Scope (charter §4 P6 row + §3.5 "Input toolbar widgets"):** the control strip above/beside
the composer — model selector, mode selector, permission toggle, thinking selector,
service-tier toggle, MCP selector, external-context control, usage/context meter. Plus the
`toolbar/*` CSS (charter §3.10): external-context, mcp/model/mode/thinking selectors,
permission + service-tier toggles → `--sp-*` tokens.

**Cross-phase dependency scoping (a key requirements/design decision — ground in claudian +
what P1-P5 actually back):**
- **Model selector** — `ChatRuntimeQueryOptions.model` already exists (P1); likely fully
  backable in P6 (the provider's available models — Claude first).
- **Mode / thinking / service-tier selectors** — these set per-turn query options; check
  what `ChatRuntimeQueryOptions` carries vs needs additive fields (additive only, like P3/P4/P5).
- **Permission toggle** — approvals/permissions are **P7**; P6 likely ships a capability-gated
  seam / honest-defer (pattern: `supportsBrowserSelection`-style), backing lands P7.
- **MCP selector** — MCP is **P8**; P6 ships the seam / capability-gated placeholder, backing P8.
- **External-context control** — `externalContextPaths` was NG3-EXCLUDED through P5; decide if
  P6 introduces it additively or defers the control.
- **Usage / context meter** — `UsageInfo` exists (P2). Surface accumulated usage + context-window
  meter from the stream.

**Out of P6 (later phases):** approval RULES (P7); MCP client + server management (P8);
Codex/Opencode providers + their model/mode catalogs (P9 — P6 builds Claude + the SEAMS);
settings UX (P10).

**Likely P6 ADR decisions (autonomous — record each):**
- The toolbar widget model: how the control strip mounts on the composer (additive prop/slot like
  the P5 context bar); per-tab vs global control state; where the selected values thread into
  `ChatRuntimeQueryOptions` (additive fields only).
- Which selectors are fully-backed in P6 vs capability-gated seams pending P7/P8 (permission, MCP,
  external-context) — honest-defer pattern, never silently dropped.
- Provider-capability source for the selector option lists (Claude first; a capability/catalog port
  or reuse of an existing seam).

**Epic constraints (every phase):** secrets→`app.secretStorage` behind `SecretStorePort`, never
`data.json`; device/user settings→device-local; NO backwards compat; DDD inward imports + narrow ports
+ 3 bridges; Vue never imports `obsidian`; no `innerHTML`/`v-html`/`window.confirm`; `<script setup>`;
`Result<T,E>`; tests mirror `src/` + `data-testid` PageObjects; coverage 80/70/80/80; perceptual `--sp-*`
parity; identity stays Specorator; WCAG 2.2 AA; manifest untouched; CI SHA-pinned + actionlint. VERIFY
GATE (`npm run verify` + `npm run test:all` exit zero).

**Operating mode (human directive 2026-05-25):** AUTONOMOUS DRIVE — no per-phase human checkpoint;
self-parity-review vs claudian after the big implemented chunk; merge P6 to `next` autonomously after a
green gate + green CI; manual-Obsidian + parity-screenshot legs accumulate for the SINGLE FINAL human
review gate.

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.5/§3.10/§4 P6 +
`claudian-audit-{frontend,backend}.md` + `D:\Projects\claudian-main` (§3.5 sources: the
`InputToolbar`/`InputController` + `features/chat/ui/toolbar/**` selectors/toggles, the usage/context
meter, and the `toolbar/*` CSS modules).

## Hand-off notes

```
2026-05-25 (orchestrator): P6 bootstrapped on feature/toolbar-controls (off next; P0-P5 merged).
                          Scope = charter §3.5 toolbar control strip + the usage/context meter.
                          Autonomous drive. Next: /spec:requirements (pm) grounded in charter
                          §3.5/§4 P6 + audits + the claudian InputToolbar/toolbar sources. EARS
                          reqs each mapped to a claudian toolbar path + a test. KEY scoping call
                          for the pm/architect: which selectors are fully-backed in P6 (model,
                          mode, thinking, service-tier, usage meter) vs capability-gated seams
                          pending P7 (permission) / P8 (MCP) / external-context (NG3). Additive-only
                          ChatRuntimeQueryOptions fields for the per-turn controls.
```
