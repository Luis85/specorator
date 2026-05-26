---
feature: providers-registry
area: PV
current_stage: tasks
status: complete
last_updated: 2026-05-26
last_agent: planner (/spec:tasks)
epic: claudian-reboot
phase: P9
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.6/§4 P9 + audits + claudian-main stand in, mirrors P1-P8)
  research.md: skipped
  requirements.md: accepted (PRD-PV-001 — 64 EARS REQ-PV + 14 NFR-PV + 7 CLAR-PV)
  design.md: complete (DESIGN-PV-001 — Parts A/B/C; ADR-PV-001/002/003 accepted)
  spec.md: complete (SPEC-PV-001 — 34 spec items, 6 layer groups; 20 EC-PV; TEST-PV-001..114 + M1..M4; full REQ↔SPEC↔TEST table)
  tasks.md: complete (TASKS-PV-001 — 44 T-PV tasks across 7 batches; TDD RED-before-green; 4 manual legs M1/M2/M3/M4; dep graph + coverage sanity-check)
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
| 5. Specification | `spec.md` | complete |
| 6. Tasks | `tasks.md` | complete |
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
2026-05-26 (architect): Stage 5 COMPLETE. specs/providers-registry/spec.md (SPEC-PV-001) written — 34 spec
                          items across 6 layer groups (DOMAIN SPEC-PV-001..007: ProviderId widen +
                          ProviderDescriptor/ProviderCapabilities frozen bag + pure resolveProvider helpers +
                          ProviderRegistryPort/SecretStorePort/HomeFsPort + the widened CHAT_RUNTIME_FACTORY/
                          OPEN_PROVIDER_CONSENT seam; INFRA 008..012: the descriptor-table registry + the
                          coverage-excluded Codex JSON-RPC + ACP transports + 3 bridges (Mock scriptable / LS
                          inert); APPLICATION 013..015: SelectProviderUseCase + ProviderConsentGate +
                          buildProviderViewModel; UI 016..020: ProviderChooser/ProviderOption/ProviderSecretField
                          + provider-aware P6 widgets + composables + wiring; STYLES 021; CROSS-CUTTING 022..034:
                          frozen matrix, the selection/consent/transport state models, additivity, security,
                          no-switch(providerId), i18n, the widened-factory contract, the minAppVersion check,
                          coverage-exclusion, history parity). 20 EC-PV; TEST-PV-001..114 + the 4 manual legs
                          (M1 Codex JSON-RPC, M2 Opencode ACP, M3 app.secretStorage+minAppVersion, M4 parity
                          screenshots) U/A/M split; FULL REQ-PV↔SPEC-PV↔TEST-PV coverage table — all 56 REQ-PV +
                          14 NFR-PV chained, no TBD. Five design open items RESOLVED in §0: (1) widened factory
                          (providerId)→Result + every P0-P8 site + tabs store passes the resolved active provider
                          (default 'claude'), Claude → ok same runtime as P8 (byte-identical); (2) build BACKED
                          caps only + honest-false the GATED-OFF (NG1); (3) listKeys + service-tier toggle off
                          the P9 critical path; (4) secret key namespace provider.<id>.apiKey, home roots
                          ~/.codex+~/.claude with path-escape→err, consent key provider.homeFsConsent.<id>;
                          (5) turn streams through the runtime (no separate turn-time transport call). No new
                          ADR needed (ADR-PV-001..003 cover it). HAND-OFF → /spec:tasks (planner): decompose the
                          34 SPEC-PV into T-PV-NNN; sequence pure-domain-first (widen ProviderId → frozen
                          descriptor table + resolve helpers + view-model → the 3 ports + 3 bridges incl. the
                          in-memory secret/inert home-fs + the scriptable transport → SelectProviderUseCase +
                          ProviderConsentGate + the provider-aware widgets + the chooser/secret UI); the real
                          Codex JSON-RPC + ACP transports + real SecretStorePort/HomeFsPort (coverage-excluded)
                          are the final manual-leg tasks (TEST-PV-M1/M2/M3). The minAppVersion app.secretStorage
                          check is a dev task (escalate-don't-bump). No open clarifications block the planner.
2026-05-26 (planner): Stage 6 COMPLETE. specs/providers-registry/tasks.md (TASKS-PV-001) written — 44
                          T-PV tasks decomposing SPEC-PV-001..034, mirroring TASKS-MC-001 (P8) + TASKS-AS-001
                          (P7) shape: baseline/guard-verify first (T-PV-001), then layer batches with strict
                          RED(qa)-before-impl(dev), every dev task's first DoD = "prior RED passes" +
                          whole-project npm run lint 0 + typecheck 0 + test green + impl-log. BATCHES: B0
                          baseline T-PV-001; B1 DOMAIN T-PV-002..010 (ProviderId+settings widen; frozen
                          ProviderDescriptor/capability matrix; pure resolveProvider; the 3 ports + keys +
                          barrels; the WIDENED CHAT_RUNTIME_FACTORY + OPEN_PROVIDER_CONSENT seam); B2 INFRA
                          T-PV-011..018 (shared descriptor-table ProviderRegistry coverage-included; Mock
                          scriptable runtime/transport + in-memory secret + inert/seedable home-fs +
                          fake-ports; LS inert; ObsidianBridge runtime registry + real app.secretStorage +
                          real node:fs home-fs cov-excluded; Codex JSON-RPC + shared ACP transports
                          cov-excluded); B3 APPLICATION T-PV-019..024 (SelectProviderUseCase,
                          ProviderConsentGate, pure buildProviderViewModel); B4 UI T-PV-025..032 (3
                          composables; ProviderChooser/ProviderOption; ProviderSecretField; provider-aware P6
                          widgets incl. opencode-model-picker + capability-gated affordances; co-located
                          data-testid POs); B5 STYLES T-PV-033 (--sp-* slice, ASCII-only lightningcss-safe);
                          B6 WIRE-IN T-PV-034..036 (provide 3 ports + widened factory + consent launcher;
                          tabs-store resolved-provider routing; provider-addressed history; chooser mount; dev
                          smoke); B7 GATE T-PV-037..044 (invariants RED/green, token+additivity guard, the 4
                          MANUAL legs T-PV-040 M1 Codex / T-PV-041 M2 Opencode / T-PV-042 M3 secret+minAppVersion
                          / T-PV-043 M4 parity, feature DoD + draft PR into next). GUARD-RELAX VERDICT: NO
                          relaxation needed — the new PROVIDER_REGISTRY_PORT/SECRET_STORE_PORT/HOME_FS_PORT keys
                          + @/domain/chat/providers/** + @/application/chat/providers/** + @/ui/chat/providers/**
                          + @/infrastructure/providers/** + the 3 new port paths are NOT in DELETED_SUBSYSTEM_BAN/
                          DELETED_INJECTION_KEYS. SECRET-INFRA FILE-NAMING DIRECTIVE (T-PV-001/T-PV-017/T-PV-044):
                          @/infrastructure/obsidian/ObsidianSecretStore* IS a still-banned glob — name the real
                          secret infra SecretStorage.ts (NEVER ObsidianSecretStore*), the home-fs
                          HomeFileSystem.ts, the runtimes/transports CodexRuntime/OpencodeRuntime/AcpTransport/
                          CodexRpcTransport at the obsidian/ root, never under a banned subfolder — exactly as
                          P8 did for VaultMcpConfigStore/SdkMcpClient; T-PV-001 enumerates the exact banned set
                          vs the live eslint.config.js. WIDENED-FACTORY FAN-OUT = the one INTERFACE change (not a
                          purely-additive optional): T-PV-010 widens ChatRuntimeFactory ()→ChatRuntimePort to
                          (providerId)→Result<ChatRuntimePort> + updates EVERY call site + provide-site +
                          modal-seam handle in the SAME task (build-green); resolved-provider routing finalises
                          at T-PV-035; createProviderHistoryPort(providerId)/getCatalog(providerId) are
                          UNCHANGED P3/P6 contracts (the seams receive the resolved provider at wire-in, not a
                          signature change). Capability-matrix discipline: build BACKED only, honest-false
                          GATED-OFF (NG1). HAND-OFF → /spec:implement (dev + qa): first ready task = T-PV-001
                          (baseline + guard-verify, owner dev, no deps); then the B1 DOMAIN RED-first chain
                          starting T-PV-002 (qa). The manual legs T-PV-040/041/042/043 are human-owned, never
                          agent-self-claimed, accumulating for the single final epic-review gate (autonomous drive).
```
