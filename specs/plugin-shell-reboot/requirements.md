---
id: PRD-PSR-001
title: Plugin shell reboot (P0 — Claudian-shaped rewrite foundation)
stage: requirements
feature: plugin-shell-reboot
status: accepted
owner: pm
inputs:
  - IDEA-PSR-001
  - CHARTER-CLAUDIAN-REBOOT  # 2026-05-24 amendment: CHARTER-REQ-SET + CHARTER-REQ-SEC
created: 2026-05-24
updated: 2026-05-24
epic: claudian-reboot
phase: P0
---

# PRD — Plugin shell reboot (P0)

> Phase P0 of the **claudian-reboot** epic. Research was skipped (Claudian at
> `D:\Projects\claudian-main` is the sole structural reference); this PRD reads
> `idea.md` (IDEA-PSR-001) directly as its upstream input. The reboot decision is
> final and out of scope for re-litigation here.

## Summary

We are gutting the plugin's accreted feature, workflow, and agent-surface code and
keeping only the proven architectural skeleton (DDD layering, the six ADR-008
narrow ports, the three bridge runtimes, `Result`, `EventBus`, the module system,
and the test harness), so that phases P1–P7 of the claudian-reboot epic build on a
clean baseline instead of on top of the surface being discarded. P0 produces a
plugin that compiles, passes the full verify gate, and boots in Obsidian as a
single empty agent sidebar view and nothing else. The "users" of P0 are the
maintainers/agent developers driving the later phases and future contributors who
read the gutted tree as the canonical starting shape.

## Goals

- G1 — Remove all feature, workflow, and agent-surface code (the `Feature`
  aggregate and workflow engine; chat/transport/provider/MCP/onboarding/design
  surfaces; the feature-specific ports) and the documentation/settings references
  to them, leaving the architectural skeleton intact.
- G2 — Keep the gutted tree green on the full verify gate, with coverage thresholds
  still met.
- G3 — Boot in Obsidian as one empty agent sidebar view with no console errors and
  no orphaned commands or ribbon entries referencing deleted subsystems.
- G4 — Reduce `PluginSettings` to a core-only surface and keep a minimal settings
  tab persisting through `SettingsPort`, so the kept settings/module/migration code
  stays compiled, exercised, and legible.
- G5 — Record the reboot in `ADR-PSR-001` and update CLAUDE.md / AGENTS.md
  architecture sections to match the gutted state.
- G6 — Ensure the `next` integration branch actually receives CI coverage, so every
  phase PR that merges into `next` is verified rather than landing unverified.

## Non-goals

- NG1 — Building any P1–P7 feature (chat runtime, threads, composer, approvals,
  providers, MCP client, i18n beyond a minimal stub). P0 ships an empty view only.
- NG2 — Re-litigating the reboot decision or the choice of Claudian as the baseline.
- NG3 — Copying any Claudian code verbatim; Claudian is a read-only structural
  reference, reimplemented in this stack.
- NG4 — Re-introducing feature-specific ports; each returns per phase, on demand.
- NG5 — Touching `develop`-line history; prior work stays intact on `develop`.
- NG6 — Changing `manifest.json` `id`, `version`, or `minAppVersion` (intentional
  maintainer policy — R-PSR-6). Any version change rides the normal release flow.
- NG7 — Authoring the exact file-by-file delete list, the trimmed `main.ts` shape,
  or the `IconPort`/`<SpIcon>` keep/prune decision — those are design (architect)
  concerns deferred to Stage 4 (see Q4, Q5 in Clarifications).

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Plugin maintainer / agent developer (this team) | A clean, compiling baseline to start P1 (chat core) from | They are the immediate consumers of P0; a half-gutted tree blocks every later phase. |
| Future contributor | A legible canonical starting shape with no orphaned references to deleted subsystems | The gutted tree is read as documentation of the intended architecture. |
| Release maintainer | Manifest identity (`id`/`version`/`minAppVersion`) untouched by the reboot | The marketplace requires the release tag to equal the manifest version exactly; `minAppVersion 1.12.7` is deliberate policy. |
| CI / quality gate | Every phase PR into `next` is verified before merge | Without CI on `next`, the whole epic integrates unverified code (R-PSR-3). |

## Jobs to be done

- When I start phase P1, I want a baseline with no `Feature` aggregate, no
  chat/transport/MCP/onboarding code, and no dangling feature ports, so I can build
  the chat core on clean ground.
- When I read the gutted tree or its architecture docs, I want no references to
  deleted subsystems, so I am not misled about what exists.
- When I open a phase PR into `next`, I want CI to run the verify gate, so unverified
  code cannot integrate.
- When I open the plugin in Obsidian after P0, I want a single empty agent sidebar
  view that loads cleanly, so I can confirm the shell boots before any feature lands.

## Functional requirements (EARS)

> One requirement per entry. Stable IDs. Acceptance criteria are testable and map
> 1:1 to future tests (`TEST-PSR-NNN`). "The plugin" / "the system" names the
> Specorator Obsidian plugin built from the gutted P0 tree.

### REQ-PSR-001 — Empty agent sidebar view registers on load

- **Pattern:** event-driven
- **Statement:** *When the plugin loads in Obsidian, the plugin shall register exactly one agent sidebar `ItemView` with a stable view type.*
- **Acceptance:**
  - Given a fresh Obsidian workspace with the plugin installed
  - When `onload` completes
  - Then exactly one view type is registered for the agent sidebar, and no other plugin view types are registered.
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (Desired outcome; In-scope: "Register a single empty agent sidebar `ItemView`")
- **Traces to:** *(design)*

### REQ-PSR-002 — Empty agent sidebar view opens on demand

- **Pattern:** event-driven
- **Statement:** *When the user activates the plugin's agent sidebar view, the plugin shall open the registered view in the sidebar and render its empty placeholder content.*
- **Acceptance:**
  - Given the plugin is loaded and the view type is registered (REQ-PSR-001)
  - When the user triggers the command/affordance that opens the agent sidebar view
  - Then the view opens in the sidebar and displays its empty placeholder content with no error.
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (Desired outcome: "loads in Obsidian as a plugin that registers one empty agent sidebar view")
- **Traces to:** *(design)*

### REQ-PSR-003 — No orphaned commands or ribbon entries referencing deleted subsystems

- **Pattern:** unwanted-behaviour
- **Statement:** *If a command, ribbon item, or workspace affordance would reference a deleted subsystem (chat, transport, provider, MCP, onboarding, design canvas, or the `Feature`/workflow engine), then the plugin shall not register it.*
- **Acceptance:**
  - Given the plugin is loaded
  - When the registered commands and ribbon items are enumerated
  - Then none of them invokes or names a deleted subsystem; the only registered view-opening affordance targets the empty agent sidebar view (REQ-PSR-002).
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (Definition of Done: "no orphaned commands/ribbon icons referencing deleted subsystems")
- **Traces to:** *(design)*

### REQ-PSR-004 — Gutted tree compiles and passes the full verify gate

- **Pattern:** ubiquitous
- **Statement:** *The plugin source tree shall compile and pass the full `npm run verify` gate in its post-gut state.*
- **Acceptance:**
  - Given the gutted P0 tree
  - When `npm run verify` runs (audit, typecheck, lint, lint:style-tokens, test:coverage, build, build:web, verify:bundle-size, docs:api, validate:manifest, verify:scaffold, verify:workflows, `git diff --check`)
  - Then every step exits zero with no `--no-verify`, `--ignore-scripts`, skipped, or `if: false` bypass.
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (Definition of Done: "`npm run verify` green on the gutted tree")
- **Traces to:** *(design)*
- **Note:** The deterministic thresholds inside this gate (coverage, bundle size,
  zero console errors on load, manifest immutability) are stated as NFRs below.

### REQ-PSR-005 — No code, docs, or settings reference deleted subsystems

- **Pattern:** ubiquitous
- **Statement:** *The plugin's source, configuration, and committed documentation shall contain no import, type reference, symbol, or settings field that names a deleted feature, workflow, or agent-surface subsystem.*
- **Acceptance:**
  - Given the gutted P0 tree
  - When the source, config, and docs are searched for the deleted symbols (e.g. `Feature` aggregate, `FeatureRepository`, `ChatTransportPort`, `ProviderRegistry`, `ObsidianMcpServerPort`, `OnboardingWizard`, and the loose deleted injection keys listed in IDEA-PSR-001)
  - Then no live reference remains (no imports, no re-exports, no dead `eslint-disable` lines that referenced deleted feature code).
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (Desired outcome: "no dangling feature ports, and no misleading architecture docs"; Risk R-PSR-7)
- **Traces to:** *(design)*

### REQ-PSR-006 — `PluginSettings` reduced to a core-only surface

- **Pattern:** ubiquitous
- **Statement:** *The plugin's `PluginSettings` type and `DEFAULT_SETTINGS` shall expose only the core-only field set `{ locale, logLevel }` and shall not import from `@/domain/chat` or any deleted subsystem.*
- **Acceptance:**
  - Given the gutted P0 tree
  - When `PluginSettings` and `DEFAULT_SETTINGS` are inspected
  - Then the only fields are `locale` and `logLevel`; every chat/provider/MCP/onboarding/workflow field (`providerSelection`, `cursor*`, `autoPreferProvider`, `providerModel`, `chatTabCap`, `claudeCliPath`, `obsidianCliPath`, `mcpServerEnabled`, `userPersona`, `onboardingComplete`, `transportKind`, `specsFolder`, `archiveFolder`, `decisionsFolder`, `constitutionFile`, `gateStrictness`, `teamMode`) is absent, and there is no `@/domain/chat` import.
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (In-scope: "Reduce `PluginSettings` / `DEFAULT_SETTINGS`"; OQ-PSR-3); resolves **Q2**
- **Traces to:** *(design)*
- **Note (Q2 resolution):** P0 ships the leaner `locale` + `logLevel` shape. The
  workflow-flavoured folder/gate fields are dropped because the workflow engine that
  consumed them is deleted, so they have no consumer in P0; later phases re-introduce
  their own fields via their own modules.

### REQ-PSR-007 — Minimal settings tab persists settings via `SettingsPort`

- **Pattern:** event-driven
- **Statement:** *When the user changes a value in the plugin's settings tab, the plugin shall persist the updated `PluginSettings` through `SettingsPort.saveSettings` and the change shall be retrievable through `SettingsPort.getSettings`.*
- **Acceptance:**
  - Given the plugin's settings tab rendering the slimmed core settings (REQ-PSR-006)
  - When the user changes `locale` or `logLevel` in the tab
  - Then `SettingsPort.saveSettings` is called with the updated value, and a subsequent `SettingsPort.getSettings` returns that value.
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (In-scope: "add a settings tab (per OQ-PSR-3)"; OQ-PSR-3 resolution: minimal tab over no tab)
- **Traces to:** *(design)*

### REQ-PSR-008 — Slimmed `coreSettingsModule` validates only core fields

- **Pattern:** ubiquitous
- **Statement:** *The plugin's `coreSettingsModule` settings schema and validation shall cover only the core-only field set (REQ-PSR-006) and shall not validate any deleted provider/MCP/workflow field.*
- **Acceptance:**
  - Given the gutted P0 tree
  - When `coreSettingsModule`'s settings schema is inspected and its validation runs against a settings object
  - Then the schema defines only `locale` and `logLevel`, and validation neither requires nor references any deleted field.
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (In-scope: "reduce ... the `coreSettingsModule` schema"; OQ-PSR-2/3)
- **Traces to:** *(design)*

### REQ-PSR-009 — `ADR-PSR-001` records the reboot

- **Pattern:** ubiquitous
- **Statement:** *The repository shall contain `ADR-PSR-001` recording the reboot decision and stating that it supersedes the feature-facing scope of ADR-008 and the MPS/AUX agent-surface features.*
- **Acceptance:**
  - Given the gutted P0 tree
  - When `ADR-PSR-001` is read
  - Then it records the reboot, names what it supersedes (the feature-facing scope of ADR-008 and the MPS/AUX agent-surface features), and follows the project ADR template.
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (Desired outcome and Definition of Done: "`ADR-PSR-001` filed")
- **Traces to:** *(design — architect authors the ADR body)*

### REQ-PSR-010 — Architecture docs updated to match the gutted state

- **Pattern:** ubiquitous
- **Statement:** *The CLAUDE.md and AGENTS.md architecture sections shall describe the gutted P0 state and shall contain no reference to a deleted subsystem.*
- **Acceptance:**
  - Given the gutted P0 tree
  - When the CLAUDE.md and AGENTS.md architecture sections are read
  - Then the layer table, key-files list, and narrow-ports description reflect what survives the reboot, with no mention of `Feature`/workflow, chat/transport, MCP, onboarding, the standalone GitHub-Pages demo path (if dropped), or the deleted ports.
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (Definition of Done: "CLAUDE.md / AGENTS.md architecture sections updated")
- **Traces to:** *(design)*

### REQ-PSR-011 — Standalone `build:web` keeps a trivial empty entry on the gate

- **Pattern:** ubiquitous
- **Statement:** *The plugin shall retain a standalone browser entry that mounts an empty root, so that `npm run build:web` remains part of the verify gate and passes on the gutted tree.*
- **Acceptance:**
  - Given the gutted P0 tree with the deleted standalone views/wiring removed
  - When `npm run build:web` runs
  - Then it exits zero, building from a minimal standalone entry that imports no deleted subsystem (no `FeatureService`, `FeatureRepository`, `CHAT_TRANSPORT_PORT`, `SECRET_STORE_PORT`, `ICON_PORT`, or deleted router views).
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (OQ-PSR-1 resolution; Risk R-PSR-2); resolves **Q1**
- **Traces to:** *(design)*
- **Note (Q1 resolution):** Keep a trivial empty standalone entry rather than removing
  `build:web` from the gate. This preserves the verify gate definition unchanged
  (cheaper than editing the gate and re-justifying it) and keeps the browser-dev
  affordance alive for later phases, at the cost of a small empty entry file. The
  exact shape of that entry is a design concern.

### REQ-PSR-012 — CI covers the `next` integration branch

- **Pattern:** ubiquitous
- **Statement:** *The repository's CI shall run the verify gate on the `next` integration branch for both `push` and `pull_request` events, so that no phase PR merges into `next` unverified.*
- **Acceptance:**
  - Given the claudian-reboot epic integrates phase PRs on `next`
  - When a pull request targets `next` or a commit is pushed to `next`
  - Then the CI verify gate runs and must pass before the change can be merged.
- **Priority:** must
- **Satisfies:** IDEA-PSR-001 (Definition of Done: "`next` integration-branch CI is confirmed to actually run"; Risk R-PSR-3); resolves **Q3**
- **Traces to:** *(design — the exact `ci.yml` trigger edit is a design/implementation concern)*
- **Note (Q3 resolution):** CI must cover `next`. The chosen mechanism is to add
  `next` to the CI `on.push.branches` and `on.pull_request.branches` lists. Editing
  `ci.yml` is a workflow change, so the actionlint + 40-char SHA-pin gate applies;
  the precise YAML edit is left to design/implementation. A local-only verify gate is
  rejected as the sole mechanism because it is not enforceable on merge.

### REQ-PSR-013 — User/device-scoped settings persist to device-local storage, not `data.json`

- **Pattern:** event-driven
- **Statement:** *When the plugin persists `PluginSettings`, the plugin shall write the user/device-scoped fields (`locale`, `logLevel`) to a device-local store outside `data.json`, and on first load after upgrade shall read any legacy `data.json` settings into the device-local store and clear them from `data.json`.*
- **Acceptance:**
  - Given the plugin loaded on a vault whose `data.json` carries a legacy persisted settings blob with `locale` and/or `logLevel`
  - When `onload` completes (the one-time migrate-and-clear runs) and the user subsequently changes `locale` or `logLevel` and the change is saved
  - Then after the save (a) the device-local store returns the changed value through `SettingsPort.getSettings` (round-trip), and (b) `data.json` contains no `locale` and no `logLevel` field — neither carried forward from the legacy blob nor written by the save.
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1 (CHARTER-REQ-SET); §6a "Settings storage — RESOLVED" (P0-relevant)
- **Traces to:** design §C.3a (migrate-and-clear) + §C.3b (three-bridge story) + §C.6/§C.16 (`ObsidianBridge` re-point); SPEC-PSR-002a (migrate-and-clear contract + edges) + SPEC-PSR-008 (tab persistence); ADR-PSR-002; TEST-PSR-024/025
- **Note:** The `SettingsPort` **contract is unchanged** (`getSettings`/`saveSettings`). Only its `ObsidianBridge` backing store moves from `data.json` (`loadData`/`saveData`) to a device-local store (Obsidian `app.loadLocalStorage`/`saveLocalStorage`, device-scoped and not synced, or an equivalent gitignored device-local file). This requirement re-points the persistence of REQ-PSR-006/007/008 — it does not change which fields exist (still `{ locale, logLevel }`) nor the settings-tab behaviour (REQ-PSR-007 still calls `SettingsPort.saveSettings`). Rationale (CHARTER-REQ-SET): vaults are used collaboratively and git-backed, so `data.json` is committed and shared; personal/device prefs must not leak into shared, version-controlled state. `data.json` holds only genuinely vault-shared settings — P0 has none, so P0's `data.json` settings slice ends up empty after migration. The one-time migrate-and-clear is required so old shared blobs stop being committed. The migration of the *field shape* (strip-on-read to `{ locale, logLevel }`) is REQ-PSR-008/SPEC-PSR-002; this requirement adds the *storage-location* migrate-and-clear on top of it.

### REQ-PSR-014 — Secrets never persist to `data.json` (inherited epic constraint, P0-vacuous)

- **Pattern:** unwanted-behaviour
- **Statement:** *If the plugin needs to persist an API key, token, or any other secret, then the plugin shall store it through Obsidian native secret storage (`app.secretStorage`, vault-keyed local storage outside `data.json`) behind a `SecretStorePort`, and shall never write the secret value to `data.json`.*
- **Acceptance:**
  - Given the gutted P0 tree
  - When the source, configuration, and persisted `data.json` are inspected for any secret value (API key, token, credential)
  - Then P0 introduces no secret surface and writes no secret to `data.json` — the requirement is satisfied **vacuously** in P0 (no secret exists until the first provider lands in P1+); the `SecretStorePort` and its `app.secretStorage` binding are introduced when the first secret appears.
- **Priority:** must
- **Satisfies:** CHARTER-CLAUDIAN-REBOOT §1 (CHARTER-REQ-SEC); §6a "Secret handling — RESOLVED"
- **Traces to:** *(design — `SecretStorePort` ADR deferred to P1; no P0 design surface)*
- **Note (P0 scope):** Stated here for **traceability** of the inherited epic constraint, not because P0 builds a secret surface. P0 has no API keys or providers (the first secret lands at ≈P1, the Claude key). P0 therefore satisfies REQ-PSR-014 by storing no secret and writing none to `data.json`; in fact P0's reboot **deletes** the prior `SECRET_STORE_PORT`/`SecretStorePort` and `SECRET_ID_*` surface (see SPEC-PSR-013 deleted-symbol ban). The clean `SecretStorePort` contract + `app.secretStorage` binding are designed when the first secret is needed (P1+), under a deferred ADR. We explicitly **reject** Claudian's approach of writing raw API keys into settings JSON. **Open flag for P1:** the `app.secretStorage` API availability at `minAppVersion 1.12.7` is unconfirmed — verify before the P1 secret surface lands; if it needs a newer Obsidian, escalate rather than silently bump the manifest (NG6 / R-PSR-6).

## Non-functional requirements

> Targets inherited from the repository's actual gate definitions: `package.json`
> `verify` script, `vitest.config.ts` coverage `include`/`thresholds`, `.github/
> workflows/ci.yml`, and `manifest.json`. The coverage-threshold target is captured
> against the **gutted P0 tree** (the only relevant baseline; there is no prior P0
> tree to diff against). NFR-PSR-006 introduces no new threshold — it restates the
> existing `verify:bundle-size` budget. NFR-PSR-010/011 are added by the 2026-05-24
> settings/secret amendment (CHARTER-REQ-SET / CHARTER-REQ-SEC): NFR-PSR-010 is a
> data-hygiene regression guard (a boolean check on the persisted blob, not a tuned
> threshold); NFR-PSR-011 is a compatibility check against the existing
> `minAppVersion 1.12.7` pin (no new version threshold introduced).

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-PSR-001 | quality-gate | Full verify gate green on the gutted tree | `npm run verify` exits zero across every step (audit `--audit-level=high --omit=dev`, typecheck, lint, lint:style-tokens, test:coverage, build, build:web, verify:bundle-size, docs:api, validate:manifest, verify:scaffold, verify:workflows, `git diff --check`) |
| NFR-PSR-002 | testability | Coverage thresholds met on the gutted tree | Over the `vitest.config.ts` `include` set (`src/domain/**`, `src/application/**`, `src/infrastructure/**`, `src/modules/**`, `src/core/**`, with the existing excludes): statements ≥ 80%, branches ≥ 70%, functions ≥ 80%, lines ≥ 80% |
| NFR-PSR-003 | reliability | Plugin loads with zero console errors | On `onload` in Obsidian, the developer console shows zero errors and zero unhandled rejections attributable to the plugin |
| NFR-PSR-004 | buildability | Plugin bundle builds | `npm run build` (vue-tsc + vite `--mode plugin`) produces `main.js` at the project root with no error |
| NFR-PSR-005 | buildability | Standalone bundle builds | `npm run build:web` (vue-tsc + vite) produces the standalone bundle with no error (see REQ-PSR-011) |
| NFR-PSR-006 | performance | Bundle size within existing budget | `npm run verify:bundle-size` passes against the budget already enforced by `scripts/check-bundle-size.mjs` (no new threshold introduced) |
| NFR-PSR-007 | release-integrity | Manifest identity untouched | `manifest.json` retains `id: "specorator"`, `version: "0.0.1"`, `minAppVersion: "1.12.7"` unchanged; `validate:manifest` passes |
| NFR-PSR-008 | supply-chain | Workflow changes stay SHA-pinned + lint-clean | Any `ci.yml` edit for REQ-PSR-012 keeps every `uses:` pinned to a 40-char commit SHA and passes `actionlint` + `verify:workflows` |
| NFR-PSR-009 | legibility | No dead bypass artifacts | No `eslint-disable` comment, stubbed test, or `if: false` step survives that exists only to mask deleted-subsystem references (supports REQ-PSR-005) |
| NFR-PSR-010 | data-hygiene | No user/device-scoped settings in committed `data.json` | After the plugin saves settings on the gutted P0 tree, the persisted `data.json` settings slice contains **no** `locale` and **no** `logLevel` field (regression guard for REQ-PSR-013 / CHARTER-REQ-SET); the round-trip value is read back from the device-local store |
| NFR-PSR-011 | compatibility | Device-local storage API supported at the pinned `minAppVersion` | The device-local persistence API used for REQ-PSR-013 (Obsidian `app.loadLocalStorage`/`saveLocalStorage` or equivalent) is verified available at `minAppVersion 1.12.7` (NFR-PSR-007 keeps the manifest pin unchanged). **Flag (P1, not P0):** `app.secretStorage` (REQ-PSR-014 / CHARTER-REQ-SEC) availability at `1.12.7` is **unconfirmed** — verify before the first secret surface lands; if it needs a newer Obsidian, escalate per NG6 / R-PSR-6 rather than silently bumping the manifest |

## Success metrics

- **North star:** P0 merges into `next` with the plugin booting one empty agent
  sidebar view and the full verify gate green — i.e. a developer can start P1 from a
  clean, compiling baseline.
- **Supporting:**
  - Zero live references to any deleted subsystem in source, config, or docs
    (REQ-PSR-005).
  - Coverage thresholds (80/70/80/80) still met on the smaller tree (NFR-PSR-002).
  - CI runs and passes on the `next` branch for the P0 PR (REQ-PSR-012).
  - After a settings save, the committed `data.json` settings slice carries **no**
    `locale`/`logLevel` field (NFR-PSR-010 / REQ-PSR-013); the value round-trips
    through the device-local store.
- **Counter-metric:** number of verify-gate bypasses introduced to make P0 pass
  (`--no-verify`, `--ignore-scripts`, `if: false`, skipped tests, coverage-`include`
  removals that hide untested kept code, or `eslint-disable` lines masking deleted
  references). Target: **zero**. A green gate achieved by weakening the gate is a
  P0 failure, not a pass.

## Release criteria

What must be true to ship P0 (merge into `next`).

- [ ] All `must` requirements (REQ-PSR-001 … REQ-PSR-014) pass their acceptance criteria
      (REQ-PSR-014 is satisfied vacuously in P0 — no secret surface exists).
- [ ] All NFRs (NFR-PSR-001 … NFR-PSR-011) met, or explicitly waived with an ADR.
- [ ] `npm run verify` green on the gutted tree with zero bypasses (counter-metric = 0).
- [ ] Plugin builds and loads in Obsidian, registering one empty agent sidebar view
      with no console errors (NFR-PSR-003) and no orphaned commands/ribbon entries
      (REQ-PSR-003).
- [ ] Coverage thresholds (80/70/80/80) pass on the gutted tree (NFR-PSR-002); any
      `vitest.config.ts` coverage `include` change is justified in the PR (a kept
      file legitimately untestable in P0), not used to hide untested kept code.
- [ ] `ADR-PSR-001` filed (REQ-PSR-009).
- [ ] CLAUDE.md / AGENTS.md architecture sections updated (REQ-PSR-010), no dangling
      references.
- [ ] CI confirmed to run on `next` (REQ-PSR-012); any `ci.yml` edit is SHA-pinned
      and actionlint-clean (NFR-PSR-008).
- [ ] `manifest.json` `id`/`version`/`minAppVersion` unchanged (NFR-PSR-007).
- [ ] After a settings save, `data.json` carries no `locale`/`logLevel` field
      (NFR-PSR-010 / REQ-PSR-013); the legacy `data.json`→device-local migrate-and-clear
      ran once on upgrade; the value round-trips through the device-local store.
- [ ] The device-local persistence API used for REQ-PSR-013 is verified available at
      `minAppVersion 1.12.7` (NFR-PSR-011); the `app.secretStorage` availability flag
      is recorded for P1 (no P0 secret surface).
- [ ] Storybook/Playwright test job passes — orphaned `.stories` files for deleted
      components are removed or stubbed alongside their components (Risk R-PSR-4);
      run `npm run test:all` locally before merge.

## Open questions / clarifications

> Q1–Q3 are **resolved** in this PRD (REQ-PSR-011, REQ-PSR-006, REQ-PSR-012
> respectively). Q4–Q5 are deferred to design per scope; see the Clarifications
> block below. The 2026-05-24 settings/secret amendment (REQ-PSR-013, REQ-PSR-014)
> adds CL-5..CL-9 as downstream deltas for the architect + planner. No open question
> blocks `status: accepted`.

See [Clarifications](#clarifications).

## Out of scope

What we explicitly will not do this cycle. (See Non-goals NG1–NG7.) In particular:
no P1–P7 feature work; no verbatim Claudian copying; no manifest identity change; no
authoring of the exact delete list, trimmed `main.ts`, or the `IconPort`/`<SpIcon>`
decision (deferred to the architect).

---

## Clarifications

> Resolved in-PRD or deferred to a named owner. Nothing here blocks acceptance.

- **Q1 — standalone `build:web` (RESOLVED, REQ-PSR-011):** Keep a trivial empty
  standalone entry so `build:web` stays on the verify gate and passes. Rationale:
  preserves the gate definition unchanged and keeps the browser-dev affordance for
  later phases; cheaper and more reversible than removing the gate step.
- **Q2 — slim `PluginSettings` shape (RESOLVED, REQ-PSR-006):** Drop to `locale` +
  `logLevel` only. The workflow-flavoured folder/gate fields are removed because their
  consumer (the workflow engine) is deleted; later phases re-add their own fields via
  their own modules.
- **Q3 — `next`-branch CI (RESOLVED, REQ-PSR-012):** CI MUST cover `next` on `push`
  and `pull_request`. Mechanism: add `next` to the CI trigger lists (a workflow change
  subject to actionlint + SHA-pin). A local-only verify run is rejected as the sole
  guard because it is unenforceable at merge. The exact `ci.yml` edit is a
  design/implementation concern.
- **Q4 — keep `IconPort` + `<SpIcon>`? (DEFERRED → architect, design):** Whether the
  empty P0 view needs an icon, and therefore whether `IconPort`/`<SpIcon>` survive or
  are pruned with the other feature ports, is an architecture decision. PM does not
  resolve it here.
- **Q5 — exact file-by-file delete list + trimmed `main.ts` shape (DEFERRED →
  architect, design):** Tracing imports to produce the precise delete list (mitigating
  R-PSR-1, delete leaf-first) and the trimmed `main.ts` shape are design concerns. PM
  does not resolve them here.

### `/spec:clarify` gate findings (2026-05-24)

- **CL-1 — `locale` consumer (RESOLVED → amends REQ-PSR-006):** Keeping `locale` in
  the slim settings while gutting i18n would orphan the field (contradicting
  REQ-PSR-005). **Resolution:** P0 retains a **minimal i18n / `TranslationPort` stub**
  that reads `locale`, so the setting has a live consumer and the i18n seam survives
  for P7. Slim settings stay `{ locale, logLevel }`. Architect must keep (decoupled)
  the minimal translation seam in the Keep set; planner adds a test that the stub
  honours `locale`.
- **CL-2 — REQ-PSR-005 verification mechanism (RESOLVED → amends REQ-PSR-005):** The
  "no live reference to deleted subsystems" check is an **automated guard**, not a
  one-time manual review: an ESLint `no-restricted-imports` rule (deleted-symbol /
  deleted-path patterns) plus a CI-run test that fails on any deleted-symbol
  reference. This becomes a durable `TEST-PSR-*` and is regression-proof against a
  later phase re-introducing a deleted name. Architect specifies the rule + test seam;
  it runs inside the existing lint/test gate (no new gate step).
- **CL-3 — open affordance for the empty view (DEFERRED → architect):** REQ-PSR-002
  names "the command/affordance that opens the view" without choosing command-palette
  entry vs ribbon icon vs both. Architect picks the single open path (consistent with
  REQ-PSR-003's one-affordance rule).
- **CL-4 — Vue mount vs bare `ItemView` (DEFERRED → architect):** Whether the empty
  agent sidebar view mounts the Vue app (exercising the kept UI/port-provide/
  `ErrorBoundary` machinery, relevant to NFR-PSR-002 coverage) or renders bare DOM is
  an architecture decision. Architect decides in Stage 4.

### Settings/secret amendment (2026-05-24) — downstream deltas to re-process

> Added by the PM settings/secret amendment for REQ-PSR-013 (CHARTER-REQ-SET) +
> REQ-PSR-014 (CHARTER-REQ-SEC). These flag *what* changes for the architect +
> planner to re-process; PM does **not** design the storage mechanism or migration
> here. The upstream spec/design were `complete`; this amendment re-opens the
> following items for re-verification (workflow-state moves back to Stage 3 for the
> amendment; the architect re-touches spec §C.3/§C.6 + SPEC-PSR-002).

- **CL-5 — `SettingsPort` backing store re-points (RESOLVED-IN-DESIGN → design
  §C.16 + §C.6, SPEC-PSR-008 + SPEC-PSR-002a, ADR-PSR-002):** REQ-PSR-013 moves the
  `ObsidianBridge` backing store for `SettingsPort.getSettings`/`saveSettings` off
  `data.json` (`loadData`/`saveData`) onto a device-local store (Obsidian
  `app.loadLocalStorage`/`saveLocalStorage`, key `specorator:settings`, device-scoped
  + not synced; gitignored device-local file as the ADR-PSR-002 Option C escalation
  fallback). **Resolved:** design §C.16 re-points `ObsidianBridge.getSettings`/
  `saveSettings`; §C.6 drops the `onload` `saveData(this._storedData)` settings write
  (settings no longer ride `data.json`; `_storedData`/`saveData` has no remaining P0
  settings consumer — dropped unless a non-settings module needs the round-trip).
  SPEC-PSR-008 pins the tab persistence via the re-pointed port; SPEC-PSR-002a pins
  the bridge round-trip. `MockBridge` (in-memory) / `LocalStorageBridge`
  (web-localStorage) unchanged (design §C.3b).

- **CL-6 — SPEC-PSR-002 migration gains a storage-location clear (RESOLVED-IN-DESIGN
  → design §C.3a, SPEC-PSR-002a):** The strip-on-read field migration (SPEC-PSR-002)
  now composes with a **one-time storage-location migrate-and-clear** (project →
  relocate → clear). **Resolved:** design §C.3a + SPEC-PSR-002a pin the contract and
  the idempotency + edge table (legacy present / already migrated / both populated
  [device-local wins] / both empty / second-run no-op / device-local API
  unavailable). The field-shape strip and the storage-location clear compose:
  project (reuse `coreSettingsModule.migrate`) → relocate (seed device-local only if
  empty) → clear (`data.json` slice deleted). Tests: TEST-PSR-024 (data-hygiene,
  NFR-PSR-010) + TEST-PSR-025 (relocate-and-clear idempotency).

- **CL-7 — new ADR-PSR-002 warranted (RESOLVED → filed at
  `docs/adr/ADR-PSR-002-settings-storage-device-local.md`, status: accepted):**
  ADR-PSR-002 records the device-local backing-store choice for `SettingsPort`, the
  one-time `data.json`→device-local migrate-and-clear contract, the
  `minAppVersion 1.12.7` API-availability check (NFR-PSR-011), and a forward pointer
  that the `SecretStorePort`/`app.secretStorage` ADR is deferred to P1 (not folded
  in here). Matches the ADR-PSR-001 format; added to the design + spec `adrs:`
  frontmatter. Charter §6a "Settings storage — RESOLVED, P0-relevant, ADR filed in
  P0" satisfied.

- **CL-8 — `SecretStorePort` ADR deferred to P1 (→ architect, P1; NOT P0):**
  REQ-PSR-014 is a P0-vacuous inherited constraint. The `SecretStorePort` contract +
  `app.secretStorage` binding ADR is **deferred to P1** (the first secret — the
  Claude key). P0 designs **no** secret surface and (per SPEC-PSR-013) deletes the
  prior `SECRET_STORE_PORT`/`SecretStorePort`/`SECRET_ID_*` symbols. Flag carried to
  P1: confirm `app.secretStorage` is available at `minAppVersion 1.12.7` before that
  surface lands (NFR-PSR-011); escalate, do not bump the manifest silently (NG6).

- **CL-9 — planner: add the regression guard + migration tasks (→ planner):**
  REQ-PSR-013 + NFR-PSR-010 need (a) a test asserting that after a settings save the
  `data.json` settings slice has no `locale`/`logLevel` and the value round-trips
  through the device-local store, and (b) a test for the one-time legacy
  `data.json`→device-local migrate-and-clear (idempotent). These extend the existing
  SPEC-PSR-002 migration tasks (T-PSR-001..004 cluster) and the bridge re-point
  (T-PSR-021 bridge work) rather than adding a new delete wave. No new task is needed
  for REQ-PSR-014 in P0 (vacuous); the planner only records it traces to the deferred
  P1 `SecretStorePort` ADR.

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID (REQ-PSR-001 … 014).
- [x] Acceptance criteria testable (Given/When/Then, map 1:1 to future tests).
- [x] NFRs listed with targets inherited from actual gate definitions (NFR-PSR-001 … 011).
- [x] Success metrics defined, including a counter-metric (verify-gate bypasses = 0).
- [x] Release criteria stated.
- [x] `/spec:clarify` self-check: Q1–Q3 resolved into requirements; Q4–Q5 explicitly
      deferred to the architect with owners — no open question blocks acceptance.
- [x] Settings/secret amendment (2026-05-24): REQ-PSR-013 (CHARTER-REQ-SET) +
      REQ-PSR-014 (CHARTER-REQ-SEC) added in EARS; NFR-PSR-010/011 added; downstream
      deltas (CL-5..CL-9) flagged to architect + planner. REQ-PSR-014 is P0-vacuous;
      its `SecretStorePort` ADR is deferred to P1. No open question blocks acceptance.
