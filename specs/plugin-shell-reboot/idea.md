---
id: IDEA-PSR-001
title: Plugin shell reboot (P0 — Claudian-shaped rewrite foundation)
stage: idea
feature: plugin-shell-reboot
status: accepted
owner: analyst
created: 2026-05-24
updated: 2026-05-24
epic: claudian-reboot
phase: P0
---

# Idea — Plugin shell reboot (P0)

> Phase P0 of the **claudian-reboot** epic. Seed captured from the 2026-05-24
> brainstorming dialogue; refined by the analyst at `/spec:idea` against the
> actual `src/` tree. Research is **skipped** (Claudian at `D:\Projects\claudian-main`
> is the sole structural reference) — no `research.md` will be produced.

## Problem statement

The plugin's agent surface has accreted across five sequential features
(`claude-cli-chat-sidebar` → agent-sidepanel-v2/v3 → MPS → AUX), and the workflow
engine alongside it. Each layer was added on top of the last, so the current code
carries a thick stack of feature-specific machinery (chat orchestration, transport
selection, provider registry, MCP server, onboarding, design-canvas, the `Feature`
aggregate and its repository/codec) that the team has decided — eyes open, sunk
cost acknowledged — to **stop iterating** and instead regrow on a cleaner,
Claudian-shaped baseline. The reboot decision itself is final and not in scope for
this idea. What P0 must solve is narrower: produce a *minimal, demonstrably booting*
plugin that retains only the proven architectural skeleton (DDD layering, narrow
ports, three bridges, `Result`, `EventBus`, module system, test harness, CI) and
sheds everything feature- or workflow-specific, so phases P1–P7 build on clean
ground rather than on top of the surface being discarded.

## Target users

- **Primary:** the plugin maintainers / agent developers (this team). P0 has no
  end-user-visible feature beyond an empty sidebar; its "users" are the P1–P7
  phases that will build on the skeleton.
- **Secondary:** future contributors who read the gutted tree as the canonical
  starting shape for the Claudian-shaped rewrite. The skeleton must be legible —
  no orphaned references to deleted subsystems in code, docs, or settings.

## Desired outcome

After P0 merges into `next`, the repository compiles, passes the full verify gate,
and loads in Obsidian as a plugin that registers **one empty agent sidebar view**
and nothing else. The DDD skeleton, narrow-port seam, three bridge runtimes,
`Result`, `EventBus`, module system, and test harness all survive intact and green.
A developer starting P1 (chat core) finds a clean slate: no `Feature` aggregate, no
chat/transport/MCP/onboarding code, no dangling feature ports, and no misleading
architecture docs. `ADR-PSR-001` records the reboot and what it supersedes.

## Scope

### In scope (P0)

- Delete the feature + workflow + agent-surface code (see **Delete** inventory).
- Keep and de-couple the architectural skeleton (see **Keep** inventory).
- Reduce `PluginSettings` / `DEFAULT_SETTINGS` and the `coreSettingsModule` schema
  to a core-only surface so the kept infra compiles after the chat/provider types
  are deleted (see OQ-PSR-3).
- Register a single empty agent sidebar `ItemView` from `src/plugin/main.ts`.
- Prune the typed-port barrel, the bridge `implements` clauses, and the standalone
  entry so nothing references a deleted feature type (see OQ-PSR-2).
- File `ADR-PSR-001`; update CLAUDE.md / AGENTS.md architecture sections to match
  the gutted state.

### Out of scope (P0 — regrown in P1–P7)

- Any chat runtime, streaming, thread/composer/approval surface, provider adapters,
  MCP client/server, i18n locales beyond a minimal stub.
- The `Feature` aggregate and the entire spec-driven workflow engine.
- Re-introducing feature-specific ports — each returns per phase, on demand.
- Copying any Claudian code verbatim; Claudian is a *read-only structural*
  reference, reimplemented in this stack.

## Keep (architecture — proven, not Claudian-specific)

Validated against the tree. Note: most of these compile cleanly only **after** the
de-coupling work in OQ-PSR-2/3 lands; "Keep" means "survives the reboot", not
"untouched".

- **Build / test / lint / CI config:** `vite.config*`, `vitest.config.ts`
  (incl. coverage `include`/`thresholds`), ESLint flat config + custom rules,
  `package.json` scripts, `.github/workflows/**`, `manifest.json`, `versions.json`,
  `scripts/validate-manifest.js`, `scripts/verify-workflows.js`.
- **ADR-008 core narrow ports** + their three bridge implementations:
  `SettingsPort`, `VaultPort`, `WorkspacePort`, `NotificationPort`, `LoggerPort`,
  `CommunityPluginPort` across `ObsidianBridge`, `MockBridge`, `LocalStorageBridge`.
  `IconPort` is borderline (see OQ-PSR-2) — kept only if a P0 view needs an icon;
  otherwise pruned with its `<SpIcon>` consumer.
- **Per-port `InjectionKey`s + composables** for the kept ports only
  (`src/infrastructure/bridge/ports.ts`, `src/ui/composables/`).
- **`Result<T,E>`** (`src/domain/shared/Result.ts`), `tryAsync`/`trySync`,
  **`EventBus` + envelope** (`src/domain/shared/event-bus.ts` — `EventMap` is
  already an empty declaration-merge target, so it is clean), **`FeedbackService`**,
  **`ErrorBoundary`**.
- **Module system:** `defineModule`, `ModuleDescriptor`/`ModulePorts`,
  `PluginCore`, `bootstrapModules`, `ALL_MODULES`. Keep `coreSettingsModule`
  (slimmed) and `helloModule` (the example/smoke module).
- **Test harness:** `tests/__fakes__/fake-ports.ts`, `tests/__fakes__/obsidian.stub.ts`,
  PageObject + `data-testid` conventions, mirror layout.

## Delete (feature + workflow + agent surface — regrown later)

Validated against the tree:

- **Feature/workflow domain + application:** `Feature` aggregate, `Slug`,
  `FeatureStep`/`FeatureStatus`, `IFeatureRepository`, `FeatureRepository`,
  `IWorkflowStateCodec` + workflow-state codec, `CreateFeatureUseCase`,
  `AdvanceFeatureStageUseCase`, `FeatureService`/`IFeatureService`,
  `useFeatures`/`useFeatureService`.
- **Chat/agent surface:** `SpecoratorView`, `AgentSidepanelView` (replaced by the
  new empty view), `ChatSidebar`/`ChatInput`, `MessageList` + block components,
  `ChatTurnOrchestrator`, `TurnInputBuilder`, `StreamDeltaReducer`,
  `consumeStream`/`collectStream`, the file-write proposal/approval flow, the
  session-log writer, `chatThreadsPersistence`/`approvalRulesPersistence`.
- **Transport / provider machinery:** `TransportSelector`/`selectTransport`,
  `buildProviderRegistry`, `ClaudeCliAdapter`, `ClaudeSubprocessAdapter`,
  `ClaudeBinaryResolver`, `CursorCliAdapter`/`CursorBinaryResolver`,
  `CursorApiAdapter`, `degradedClaudeCliPort`, `MockClaudeCliPort`,
  `MockSubprocessAdapter`.
- **MCP:** `ObsidianMcpServerAdapter` + all `register*Tools` registrars
  (workflow/metadata/links/canvas/bases), `ObsidianCliAdapter`,
  `ObsidianMetadataCacheAdapter`, `ObsidianCanvasAdapter`, the canvas/bases schemas.
- **Onboarding / design surface:** `OnboardingWizard` + steps + nudges/persona
  cards, design-canvas, prototype builder, the in-app Vue router views
  (`HomeView`, `FeaturesView`, `SettingsView`, `FileView`, `MainLayout`) if the
  standalone path is deferred (see OQ-PSR-1).
- **Feature-specific ports + InjectionKeys (re-introduced per phase):**
  `ChatTransportPort`, `TransportLifecyclePort`, `ConfirmModalPort`,
  `SecretStorePort`, `MarkdownRenderPort`, `IconPort` (borderline),
  `MetadataCachePort`, `CanvasPort`, `ObsidianMcpServerPort`, `ObsidianCliPort`,
  plus the loose injection keys `PROVIDER_REGISTRY_KEY`, `TRANSPORT_LIFECYCLE_PORT`,
  `TRANSPORT_KIND_KEY`, `IS_MOBILE_KEY`, `SETTINGS_VERSION_KEY`,
  `OPEN_PLUGIN_SETTINGS_KEY`, `PLUGIN_MANIFEST_KEY`, `SECRET_STORE_PORT`,
  `MARKDOWN_RENDER_PORT`, `CHAT_TRANSPORT_PORT`, `ICON_PORT`, `METADATA_CACHE_PORT`,
  `CANVAS_PORT`, `CONFIRM_MODAL_PORT` (`src/infrastructure/bridge/ports.ts`).
- **Chat domain types:** `src/domain/chat/**` (`ProviderSelection`, `ProviderId`,
  `ProviderRegistry`, `TransportKind`, `ChatThreadRecord`, `ApprovalRule`, …) —
  these are what `PluginSettings` currently imports and must be cut for the slim
  settings surface to compile.

*(Exact file-by-file inventory is finalized in the P0 design stage; the lists above
are the validated scoping intent.)*

## Resolved open questions

> Settled from code where possible; recommendations + forward-flags where a
> decision belongs to requirements/design.

### OQ-PSR-1 — Keep the standalone `build:web` / GitHub Pages path in P0?

**Resolution: DEFER (drop the standalone path and `LocalStorageBridge` wiring in
P0; re-introduce when a phase needs a browser demo).**

Evidence — the standalone entry is tightly bound to the deleted surface:

- `src/ui/main.ts` imports and provides `FeatureRepository`, `FeatureService`,
  `FEATURE_SERVICE_KEY`, `CHAT_TRANSPORT_PORT`, `SECRET_STORE_PORT`, `ICON_PORT`,
  `OPEN_PLUGIN_SETTINGS_KEY`, `LocalStorageSecretStore` — every one of which is on
  the Delete list.
- `src/ui/router/index.ts` routes only deleted views (`HomeView`, `FeaturesView`,
  `SettingsView`, `FileView`, `OnboardingWizard`).
- `LocalStorageBridge` (`src/infrastructure/localstorage/LocalStorageBridge.ts:22`)
  `implements ... ChatTransportPort, IconPort` and imports `PluginSettings`, so it
  carries the same chat/provider coupling that must be cut.

Keeping `build:web` green in P0 would mean rebuilding a standalone shell with no
feature to demo — pure overhead. Dropping it is cheaper and reversible. **Forward
flag for requirements:** the verify gate currently runs `npm run build:web` (CI
`verify` job + AGENTS.md §3). P0 must either (a) keep a *trivial* standalone entry
that mounts an empty root so `build:web` still passes, or (b) remove `build:web`
from the gate for the duration of the reboot. Recommend (a) — a ~20-line
`ui/main.ts` mounting an empty `AppRoot` keeps the gate intact and the browser-dev
affordance alive without dragging in any deleted code. PM/architect to confirm
which.

### OQ-PSR-2 — Does kept infra carry feature coupling that blocks a clean compile?

**Resolution: YES — the following must be pruned for the gutted tree to typecheck.**

- **`EventBus` `EventMap`** is *clean*: `src/domain/shared/event-bus.ts:5` declares
  `export interface EventMap {}` as an intentionally empty declaration-merge target.
  No feature event keys live in the core file. Any merged keys live in the
  feature/module files being deleted, so they vanish with their modules. **No prune
  needed in the bus itself.**
- **Port barrel `src/domain/ports/index.ts`** re-exports a dozen feature ports
  (`ChatTransportPort`, `MetadataCachePort`, `CanvasPort`, `ObsidianMcpServerPort`,
  `ObsidianCliPort`, `TransportLifecyclePort`, `ConfirmModalPort`,
  `SecretStorePort`, `MarkdownRenderPort`, `SECRET_ID_*`). All must be removed down
  to the six core ports (+ `TranslationPort`, `Unsubscriber`).
- **`src/infrastructure/bridge/ports.ts`** declares ~16 `InjectionKey`s and imports
  `TransportKind` + `ProviderRegistry` from `@/domain/chat`. Reduce to the six core
  port keys; delete the rest and the two `@/domain/chat` imports.
- **`PluginSettings` (`src/domain/settings/PluginSettings.ts`)** imports
  `TransportKind`, `ProviderId`, `ProviderSelection` from `@/domain/chat` and
  carries `providerSelection`, `cursorCliPath`, `cursorApiPreview`,
  `autoPreferProvider`, `providerModel`, `chatTabCap`, `claudeCliPath`,
  `obsidianCliPath`, `mcpServerEnabled`, `userPersona`, `onboardingComplete`,
  `transportKind?`. Deleting `@/domain/chat` breaks this file — see OQ-PSR-3 for the
  slim shape.
- **`coreSettingsModule` (`src/core/core-settings.ts`)** is bound to the full
  `PluginSettings` and validates every provider/MCP field. It must be slimmed in
  lockstep with `PluginSettings`.
- **Both bridges** (`MockBridge:27`, `LocalStorageBridge:22`) `implement
  ChatTransportPort, IconPort` and import `PluginSettings`/`DEFAULT_SETTINGS`. Strip
  the `ChatTransportPort` (and likely `IconPort`) implementations and their
  imports. (Correction to the seed, which claimed the bridges only implement the
  six core ports — they do not.)
- **`fake-ports.ts`** imports `IconPort` and exposes `iconPort`,
  `MockMetadataCacheAdapter`, `MockCanvasAdapter`; trim to the kept ports.
- **`src/plugin/main.ts`** is almost entirely feature wiring (transport adapters,
  secret store, MCP, chat persistence, provider URI handling, two views). It is
  effectively rewritten down to: load slim settings, construct `ObsidianBridge`,
  init `PluginCore` with the slim module set, register one empty view, add a
  settings tab (per OQ-PSR-3). **Forward flag for design:** enumerate the exact
  file-delete list and the trimmed `main.ts` shape.

### OQ-PSR-3 — Minimum viable settings surface for P0?

**Resolution: KEEP a minimal settings tab backed by a slimmed `PluginSettings`.**

`PluginSettings`/`DEFAULT_SETTINGS` cannot be deleted — `coreSettingsModule`,
`SettingsPort`, all three bridges, and the module-migration path depend on it. The
slim core surface that survives cleanly (no `@/domain/chat` dependency) is:
`locale`, `specsFolder`/`archiveFolder`/`decisionsFolder`/`constitutionFile` (or
fewer, see flag), `gateStrictness`, `teamMode`, `logLevel`. Drop every
chat/provider/MCP/onboarding field (`providerSelection`, `cursor*`,
`autoPreferProvider`, `providerModel`, `chatTabCap`, `claudeCliPath`,
`obsidianCliPath`, `mcpServerEnabled`, `userPersona`, `onboardingComplete`,
`transportKind`). Keep `SpecoratorSettingTab` rendering the slimmed
`coreSettingsModule.settingsSchema` so the kept settings/module/migration code stays
exercised and the verify-gate coverage thresholds stay reachable.

**Recommendation:** minimal tab over *no* tab — a no-tab plugin leaves
`SettingsPort`, the settings module, and the migration path untested, risking the
coverage gate (see new risk R-PSR-5). **Forward flag for requirements/design:**
decide whether the workflow-flavoured fields (`specsFolder`, `gateStrictness`,
`teamMode`, etc.) belong in the P0 core surface at all, or whether P0 should ship
an even leaner settings shape (`locale` + `logLevel`) and let later phases
re-introduce their own fields via their own modules. Recommend the leaner shape if
the workflow engine is gone — those folders have no consumer in P0.

## Definition of Done

- `npm run verify` green on the gutted tree (typecheck, lint, unit + storybook,
  build, build:web, docs:api, audit, bundle-size). If `build:web` is dropped per
  OQ-PSR-1(b), the gate definition is updated in the same change, not silently
  bypassed.
- Plugin builds and loads in Obsidian; registers a single empty agent sidebar view
  with no console errors and no orphaned commands/ribbon icons referencing deleted
  subsystems.
- Coverage thresholds (80/70/80/80 over `domain`/`application`/`infrastructure`/
  `modules`/`core`) still pass on the smaller tree (see R-PSR-5).
- `ADR-PSR-001` filed: records the reboot and that it supersedes the feature-facing
  scope of ADR-008 and the MPS/AUX agent-surface features.
- CLAUDE.md / AGENTS.md architecture sections updated to reflect the gutted state —
  no dangling references to `Feature`, chat/transport, MCP, onboarding, or the
  deleted ports.
- `next` integration-branch CI is confirmed to actually run (see R-PSR-3).

## Risks

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| R-PSR-1 | Deleting `@/domain/chat` cascades into more files than the Delete inventory anticipates (hidden imports), blocking typecheck. | med | high | Design stage produces the exact file-delete list by tracing imports; delete leaf-first; lean on `npm run typecheck` as the iterative gate. |
| R-PSR-2 | `build:web` / standalone path is on the verify gate but its entry + views are deleted, so the gate fails. | high | high | OQ-PSR-1 resolution: keep a trivial empty standalone entry **or** update the gate in the same PR. Do not `--no-verify`. |
| R-PSR-3 | **NEW** — CI `on.push`/`pull_request` covers only `[develop, demo, main]` (`.github/workflows/ci.yml:5-7`); the `next` integration branch triggers **no CI**. Phase PRs squash-merged into `next` would land unverified. | high | high | Either target phase PRs at a branch CI watches, add `next` to the CI trigger list (workflow change → actionlint + SHA-pin gate applies), or require the verify gate to pass locally before each merge into `next`. Decide in requirements. |
| R-PSR-4 | **NEW** — Storybook/Playwright test job (`test:storybook`) and `verify:bundle-size` run in CI but are *not* in the AGENTS.md §3 local pre-PR list; a gutted UI may break Storybook stories that reference deleted components. | med | med | Delete or stub orphaned `.stories` files alongside their components; run `npm run test:all` locally before the merge into `next`. |
| R-PSR-5 | **NEW** — Coverage thresholds (80/70/80/80) are computed over the kept `domain`/`application`/`infrastructure`/`modules`/`core` tree. Gutting removes well-tested feature code and may drop the *retained* skeleton below threshold (e.g. if a kept util's only tests went with a deleted feature). | med | med | Keep `helloModule` + core-settings tests; audit which tests cover kept code vs deleted; adjust `vitest.config.ts` coverage `include` in the same PR if a kept file is legitimately untestable in P0. |
| R-PSR-6 | **NEW** — `manifest.json` keeps `id: "specorator"`, `version: 0.0.1`, `minAppVersion: 1.12.7` (intentional per maintainer). A reboot must not bump these casually; the marketplace requires tag == manifest version exactly, and `minAppVersion` is a deliberate policy, not API-driven. | low | low | Leave manifest id/version/minAppVersion untouched in P0; any version change rides the normal `npm version` release flow, never an ad-hoc edit. |
| R-PSR-7 | ESLint custom rules forbid re-introducing deleted symbols (`IBridge`/`BridgeKey`/`useBridge`) and `obsidian` imports in UI; an incomplete prune could trip these or leave dead `eslint-disable` comments. | low | med | Run `npm run lint` iteratively; remove now-pointless `eslint-disable` lines that referenced deleted feature code. |

## Open questions (carried forward to requirements/design)

> Research is skipped; these are decisions, not research items.

- Q1 (from OQ-PSR-1): keep a trivial standalone `build:web` entry, or remove
  `build:web` from the verify gate for the reboot duration? — **owner: pm**
- Q2 (from OQ-PSR-3): does P0's slim `PluginSettings` keep the workflow-flavoured
  folder/gate fields, or drop to `locale` + `logLevel` only? — **owner: pm**
- Q3 (from R-PSR-3): how does the `next` integration branch get CI coverage —
  add `next` to triggers, or gate merges on a local/required verify run? —
  **owner: pm / architect**
- Q4: does P0 keep `IconPort` + `<SpIcon>` (needed only if the empty view shows an
  icon), or prune it with the other feature ports? — **owner: architect (design)**
- Q5: exact file-by-file delete list and the trimmed `src/plugin/main.ts` shape. —
  **owner: architect (design)**

## Out of scope (preliminary)

- Building any P1–P7 feature (chat, threads, composer, approvals, providers, MCP,
  i18n). P0 produces an *empty* view only.
- Re-litigating the reboot decision or the choice of Claudian as the baseline.
- Copying Claudian code verbatim.
- Touching `develop`-line history; prior work stays intact on `develop`.

## References

- Brainstorming seed: this file's prior revision + `workflow-state.md` hand-off note (2026-05-24).
- Claudian baseline: `D:\Projects\claudian-main` (MIT) — read-only structural reference.
- `src/infrastructure/bridge/ports.ts` — current (over-broad) InjectionKey surface.
- `src/domain/shared/event-bus.ts:5` — empty `EventMap` declaration-merge target.
- `src/ui/main.ts`, `src/ui/router/index.ts` — standalone path coupling (OQ-PSR-1).
- `src/domain/settings/PluginSettings.ts`, `src/core/core-settings.ts` — settings coupling (OQ-PSR-3).
- `src/infrastructure/mock/MockBridge.ts:27`, `src/infrastructure/localstorage/LocalStorageBridge.ts:22` — bridges implement feature ports.
- `.github/workflows/ci.yml:5-7` — CI trigger branches (R-PSR-3).
- `vitest.config.ts:24-42` — coverage include/thresholds (R-PSR-5).
- [Obsidian manifest reference](https://docs.obsidian.md/Reference/Manifest), [Plugin submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins) (R-PSR-6).

---

## Quality gate

- [x] Problem statement is one paragraph and understandable to a non-expert.
- [x] Target users named.
- [x] Desired outcome stated.
- [x] Constraints listed (scope in/out, DoD, manifest policy).
- [x] Open questions captured (OQ-PSR-1..3 resolved; Q1–Q5 carried forward with owners).
- [x] Scope is bounded — empty-view-only, no P1+ feature work.
