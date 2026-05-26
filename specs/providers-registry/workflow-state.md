---
feature: providers-registry
area: PV
current_stage: design
status: complete
last_updated: 2026-05-26
last_agent: architect (/spec:design)
epic: claudian-reboot
phase: P9
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.6/§4 P9 + audits + claudian-main stand in, mirrors P1-P8)
  research.md: skipped
  requirements.md: accepted (PRD-PV-001 — 64 EARS REQ-PV + 14 NFR-PV + 7 CLAR-PV)
  design.md: complete (DESIGN-PV-001 — Parts A/B/C; ADR-PV-001/002/003 accepted)
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

# Workflow state — providers-registry (P9)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | accepted |
| 4. Design | `design.md` | complete |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P9 (Codex + Opencode providers + registry)

P0-P8 merged to `next` (P8 mcp-client #449 / ae7e9559). P9 = multi-provider — the provider
**registry** + the **Codex** (app-server JSON-RPC) + **Opencode** (ACP) provider runtimes + the shared
ACP transport + model routing/capabilities/workspace registry, on the provider-agnostic P1-P8 chat
surface. **This is the LARGEST phase.**

**Scope (charter §4 P9 row + §3.6):**
- **`ProviderRegistryPort`** + the provider-selection/routing seam — the existing `ChatRuntimePort` is
  already provider-agnostic (P1 Claude CLI). P9 adds a registry that selects the active provider's
  runtime; the P6 model/mode selectors gain real per-provider options; capability flags
  (`RuntimeCapabilities`/`ToolbarCapabilities`) drive what each provider exposes.
- **Codex** — app-server JSON-RPC transport, JSONL history, skills, subagents.
- **Opencode** — ACP transport, modes, models, agents.
- **ACP** shared transport (`providers/acp`), model routing, capabilities, workspace registry.
- CSS: `opencode-model-picker` (charter §3.10) → `--sp-*`.

**POSTURE (charter §6a confirmed 2026-05-24, BINDING):** ship **Claude complete**; **Codex + Opencode
behind CAPABILITY GATES, feature-incomplete is ACCEPTABLE** (matches claudian's own posture). P9 is ONE
phase that expands later. So: build the registry + the routing seam + the two provider runtimes at a
functional-but-partial, capability-gated level — Claude stays the complete default; a non-Claude
provider honestly reports reduced capabilities (the established honest-defer pattern). **Do NOT block P9
on full Codex/Opencode parity.**

**Key P9 ADRs (architecturally load-bearing — charter §6a):**
- **`ProviderRegistryPort` + the provider-routing seam** — how the registry lists providers + selects
  the active runtime; how `createChatRuntime`/the capabilities seam become provider-routed (additive —
  Claude stays the default; P0-P8 byte-identical when only Claude is present). Narrow port, no aggregate.
- **`HomeFsPort` (beyond-vault filesystem)** — Codex/Opencode read `~/.codex` / `~/.claude` transcripts;
  the core ports are vault-scoped. **Security surface (reads outside the vault) — needs an ADR** (§6a).
  Coverage-excluded Obsidian/Node infra → manual legs. Mock/inert for tests.
- **`SecretStorePort`** — provider API keys/auth via Obsidian **native secret storage** (`app.secretStorage`),
  NEVER `data.json`/plain settings (CHARTER-REQ-SEC). §6a says this lands "≈ P9 providers". File the ADR +
  the `minAppVersion` check. Capability-gate when secret storage is unavailable.
- The ACP transport port + the Codex JSON-RPC transport (real impls coverage-excluded; Mock scriptable).

**Out of P9 (later phases):** settings shell polish / per-provider settings UX (P10 — P9 ships the
provider seams + a minimal selection surface); i18n sweep (P11); a11y + final parity (P12).

**Epic constraints (every phase):** secrets→`app.secretStorage` behind `SecretStorePort` (LANDS THIS
PHASE), never `data.json`; device/user state→device-local; beyond-vault reads via `HomeFsPort` (ADR);
NO backwards compat; DDD inward imports + narrow ports + 3 bridges; Vue never imports `obsidian`; no
`innerHTML`/`v-html`/`window.confirm`; `<script setup>`; `Result<T,E>`; tests mirror `src/` +
`data-testid` POs; coverage 80/70/80/80; perceptual `--sp-*` parity; identity stays Specorator; WCAG 2.2
AA; manifest untouched (BUT `minAppVersion` may need the secretStorage check — confirm vs the intentional
1.12.7 policy); CI SHA-pinned + actionlint. VERIFY GATE (`npm run verify` + `npm run test:all` zero).

**Operating mode (human directive, /goal 2026-05-26):** AUTONOMOUS DRIVE the FULL remaining epic
(P9→P12) via dedicated subagents in loops — no per-phase human checkpoint; self-parity-review vs claudian;
merge each phase to `next` after a green gate + green CI; deploy to `D:/TestVault` after each merge.
Manual-Obsidian + parity-screenshot legs accumulate for the SINGLE FINAL human review gate.

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.6/§6a/§4 P9 +
`claudian-audit-{frontend,backend}.md` + `D:\Projects\claudian-main` (`providers/codex`,
`providers/opencode`, `providers/acp`, the provider registry, model routing, capabilities, the
workspace registry, `~/.codex`/`~/.claude` transcript reads, the secret storage, `opencode-model-picker`).

## Hand-off notes

```
2026-05-26 (orchestrator): P9 bootstrapped on feature/providers-registry (off next; P0-P8 merged).
                          Scope = charter §3.6 multi-provider — registry + Codex (JSON-RPC) + Opencode
                          (ACP) + ACP transport + model routing/capabilities/workspace registry.
                          POSTURE: Claude complete, Codex/Opencode CAPABILITY-GATED + feature-incomplete
                          OK (§6a). Autonomous full-epic drive. Next: /spec:requirements (pm) grounded in
                          charter §3.6/§6a + audits + the claudian providers/{codex,opencode,acp} +
                          registry/routing/capabilities/secret-storage sources. KEY: scope what is
                          P9-backed vs capability-gated-stub per provider; the ProviderRegistryPort +
                          routing seam; HomeFsPort (beyond-vault, security ADR); SecretStorePort
                          (native secret storage, lands this phase, ADR + minAppVersion). Additive —
                          Claude-only = byte-identical P0-P8.
2026-05-26 (pm): Stage 3 ACCEPTED. specs/providers-registry/requirements.md (PRD-PV-001) written —
                          64 EARS REQ-PV grouped (registry/selection · routing · capabilities matrix ·
                          Codex · Opencode · ACP transport · model routing · secret storage · home-fs/history ·
                          settings/selector UI · security · a11y/additivity), 14 NFR-PV, success metrics +
                          counter-metric, release criteria, 7 CLAR-PV resolved-by-recommendation. BINDING
                          posture encoded: Claude COMPLETE default; Codex/Opencode CAPABILITY-GATED,
                          feature-incomplete acceptable. Per-provider matrix grounded in claudian
                          providers/{claude,codex,opencode}/capabilities.ts (frozen flags). Central decisions
                          stated: ProviderRegistryPort + routing seam (CLAR-PV-001), HomeFsPort beyond-vault
                          read-scoped/consented (CLAR-PV-002), SecretStorePort → app.secretStorage never
                          data.json (CLAR-PV-003), minAppVersion verdict = keep 1.12.7 + capability-gate,
                          escalate-don't-silently-bump if secretStorage needs newer (CLAR-PV-004). Additivity:
                          Claude-only = P0-P8 byte-identical (REQ-PV-114/NFR-PV-001). HAND-OFF → /spec:design
                          (architect: file the 3 P9 ADRs — ProviderRegistryPort+routing seam, HomeFsPort,
                          SecretStorePort+minAppVersion check — then Part A UX + Part B UI parity vs
                          charter §3.6/§3.10).
2026-05-26 (architect): Stage 4 COMPLETE. specs/providers-registry/design.md (DESIGN-PV-001) written —
                          Parts A (UX: provider selection/switch states, no-key/unavailable honest gate,
                          per-provider model/thinking/service-tier lists, secret-entry + beyond-vault
                          consent, WCAG 2.2 AA), B (UI: ProviderChooser/ProviderOption/ProviderSecretField
                          + provider-aware P6 ModelSelector/ThinkingSelector/ServiceTierToggle, the
                          opencode-model-picker + provider-brand --sp-* slice, en+de keys, no v-html,
                          MINIMAL surface — full settings UX = P10), C (Architecture). THREE P9 ADRs filed
                          + ACCEPTED + indexed in docs/adr/README.md:
                          - ADR-PV-001 ProviderRegistryPort + data-driven routing seam (no switch(providerId);
                            CHAT_RUNTIME_FACTORY widens to (providerId)=>Result<ChatRuntimePort>; capability-
                            flag-gated; Claude-only = byte-identical P8; routed-aux stays Claude) →
                            CLAR-PV-001/005/007.
                          - ADR-PV-002 SecretStorePort → app.secretStorage, never data.json/notice/log/DTO;
                            in-memory on Mock/LS; capability-gate when unavailable (no plain-store fallback);
                            minAppVersion verdict = keep 1.12.7 + gate, ESCALATE-don't-bump if secretStorage
                            provably needs newer (dev runs the API check at impl) → CLAR-PV-003/004/006.
                          - ADR-PV-003 HomeFsPort read-scoped (~/.codex,~/.claude)/consented(Obsidian Modal)/
                            read-only/inert-on-demo; history into the UNCHANGED P3 ProviderHistoryPort; the
                            Codex JSON-RPC + shared ACP transports coverage-excluded behind the registry's
                            runtime construction (timeout/abort/error-chunk, bounded spawn, SIGTERM→SIGKILL,
                            Mock scriptable); NO new SDK dep by default (externalize like @modelcontextprotocol/
                            sdk if ever required) → CLAR-PV-002 + the ACP/Codex transport note.
                          Per-provider capability matrix frozen 1:1 from claudian providers/*/capabilities.ts
                          (Claude all-true; Codex rewind/commands/MCP OFF, steer/fork ON; Opencode rewind/
                          fork/steer/MCP OFF, commands ON). HAND-OFF → /spec:specify (planner→spec author):
                          full ProviderRegistryPort/SecretStorePort/HomeFsPort contracts + the widened
                          CHAT_RUNTIME_FACTORY signature + the ProviderDescriptor shape + the transport
                          timeout/abort/error-chunk semantics + the consent-key/home-root/secret-key
                          conventions + per-REQ test scenarios. Slight over-spec flagged (not blocking):
                          build the BACKED caps only + honest-false the GATED-OFF (NG1); listKeys/service-
                          tier are off the P9 critical path — pin verb/feature scope in spec.md so dev does
                          not over-build.
```
