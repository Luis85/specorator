# Config-driven prototype builder — Design

**Date:** 2026-05-10
**Author:** brainstorming session (pm)
**Status:** Draft — design accepted in brainstorming, awaiting written-spec review
**Related:** [`specs/config-driven-prototype-builder/idea.md`](../../../specs/config-driven-prototype-builder/idea.md)

## 1. Summary

Add a Lowdefy-inspired, config-driven app prototype runtime to the Specorator plugin. The user authors `specs/{slug}/prototype.md` (frontmatter + markdown). The plugin renders that file as a runnable multi-page Vue 3 app inside an Obsidian view tab. AI assistance is delegated to the existing Claude CLI Chat Sidebar.

The runtime is a thin Vue-3 port of the Lowdefy interpretation model: pages and blocks as a typed tree, operator-object expressions (no `eval`), three local data adapters (`vault-file`, `feature-data`, `inline`), curated built-in block library only.

## 2. Architecture

DDD layered (ADR-001) with strict inward-only imports.

```
domain/prototype/
  PrototypeConfig.ts            # Zod-validated value object
  Block.ts, Page.ts             # immutable nodes
  Operator.ts                   # pure operator engine
  Expression.ts                 # operator-object resolver
  ports/PrototypeDataPort.ts    # narrow port for data sources

application/prototype/
  LoadPrototypeUseCase.ts
  ValidatePrototypeUseCase.ts
  ResolveExpressionUseCase.ts

infrastructure/prototype/
  PrototypeRepository.ts        # gray-matter + Zod, via VaultPort
  adapters/
    VaultFileDataAdapter.ts     # JSON/CSV/MD reader
    FeatureDataAdapter.ts       # binds to Feature aggregate
    InlineDataAdapter.ts        # config-embedded fixtures

ui/prototype/
  PrototypeView.vue             # Obsidian view tab
  blocks/                       # ~20 built-in Vue components
  PrototypeRuntime.ts           # composable, owns reactive state tree
  stores/prototypeRuntime.ts    # Pinia store per prototype
  composables/usePrototypeData.ts

plugin/
  registerPrototypeView()
```

`PrototypeDataPort` joins the existing five narrow ports (Settings, Vault, Workspace, Notification, Logger). Single method dispatched by adapter id internally — keeps ADR-008 narrow-port count flat.

## 3. Schema (`prototype.md`)

```yaml
---
specorator: 0.1
prototype:
  id: feature-card-demo
  title: Feature Card Demo
  pages:
    - id: home
      path: /
      title: Home
      blocks:
        - id: featureList
          type: List
          properties:
            data: { _data: featuresFromVault }
            empty: "No features yet"
          blocks:
            - id: card
              type: Card
              properties:
                title: { _item: title }
                subtitle: { _item: stage }
              events:
                onClick:
                  - id: goDetail
                    type: Navigate
                    params:
                      path: { _format: ["/feature/{}", { _item: id }] }
    - id: detail
      path: /feature/:id
      blocks: [ ... ]
  data:
    - id: featuresFromVault
      adapter: feature-data
      params: { status: active }
    - id: notes
      adapter: vault-file
      params: { path: data/notes.json }
    - id: countries
      adapter: inline
      params: { rows: [{ code: DE }, { code: US }] }
---

# Feature Card Demo

Markdown body free for design notes, prose, decisions.
AI uses body as context; runtime ignores it.
```

- Top-level `specorator:` key isolates from existing markdown frontmatter (`title`, `tags`).
- `prototype:` namespace leaves room for sibling configs (e.g. `dataset:`).
- Schema versioned (`specorator: 0.1`) for forward-compatible migrations.
- Body markdown is free prose. The runtime ignores it; AI uses it as authoring context.

## 4. Operator set (v1, ~15)

| Operator | Arg | Purpose |
|---|---|---|
| `_state` | string path | runtime state read |
| `_data` | string id | resolved data binding |
| `_item` | string path | current `List` iteration item |
| `_event` | string path | event payload |
| `_url_query` | string key | hash-route query param |
| `_url_params` | string key | route path param |
| `_if` | `{test, then, else}` | branch |
| `_eq` / `_not_eq` | `[a, b]` | compare |
| `_and` / `_or` / `_not` | array / value | boolean combinators |
| `_get` | `{from, key}` | object property |
| `_format` | `[template, ...args]` | string interpolation `"{}"` |
| `_length` | array | count |
| `_filter` | `{from, where}` | filter array by truthy expr |
| `_ref` | string path | include another markdown's prototype frontmatter |

Resolver evaluates **most-nested first**, returns `null` and logs to `LoggerPort` on failure (Lowdefy parity). Pure function, no IO. Tested with golden-file fixtures.

**Excluded v1:** `_js`, `_request`, `_secret`, date math, regex.

## 5. Built-in block library (v1, ~20)

**Containers (4):** `Page`, `Box`, `Card`, `List`
**Display (5):** `Heading`, `Text`, `Badge`, `Markdown`, `Empty`
**Inputs (8):** `TextInput`, `TextArea`, `NumberInput`, `Checkbox`, `Toggle`, `Select`, `RadioGroup`, `DatePicker`
**Action (3):** `Button`, `Link`, `IconButton`

Inputs implicitly bind to `state[blockId]` (Lowdefy convention). All inputs support `required` and `validate: [{pass, message, status}]`.

Events: `onClick`, `onChange`, `onMount`, `onSubmit`.
Action types: `Navigate`, `SetState`, `ResetState`, `RefreshData`, `Notify`.
Action lists support `try` / `catch` semantics.

Styling uses Obsidian CSS variables; no external UI library — keeps bundle small and theme-native.

## 6. Data flow

```
prototype.md (vault)
   │  VaultPort.readFile
   ▼
gray-matter split → frontmatter + body
   │
   ▼
Zod validate (PrototypeConfigSchema)
   │  Result<PrototypeConfig, ValidationError>
   ▼
LoadPrototypeUseCase
   │
   ▼
PrototypeRuntime (Pinia store)
  ├─ state:  Map<blockId, value>      # implicit input binding
  ├─ data:   Map<dataId, resolved>    # adapter results, reactive
  ├─ route:  {path, params, query}
  └─ events: action queue
   │
   ▼
Renderer (PrototypeView.vue)
  walks page tree → Block component → resolves operators per render
   │
   ▼
User input → SetState action → state mutation → reactive re-render
                                              + dependent _data refresh
```

`PrototypeDataPort` contract:

```ts
interface PrototypeDataPort {
  resolve(adapter: string, params: unknown): Promise<Result<unknown[], DataError>>
}
```

Single port, dispatched by adapter id. Adds one port to ADR-008's family (six total). Reactivity rides Vue's reactive system — operator resolution sits inside computed wrappers, so re-eval auto-triggers on dependency change.

## 7. Error handling

| Failure | Layer | Response |
|---|---|---|
| Frontmatter YAML parse | repo | `Result.err(ParseError)` → red banner; body markdown still shown |
| Zod validation | repo | `Result.err(ValidationError)` w/ Zod path → inline error per offending block |
| Operator resolves null/throws | engine | log via LoggerPort; render block w/ placeholder |
| Data adapter fails | adapter | `Result.err(DataError)` → block in error state; `RefreshData` retry available |
| Unknown block `type` | renderer | `<UnknownBlock>` placeholder; ErrorBoundary catches Vue errors |
| Action dispatch fail | runtime | `try` / `catch` action lists; FeedbackService surfaces user-facing notice |

Domain mutations stay `Result<T, E>` (ADR-004). No throws across layer boundaries.

## 8. Testing

- **Domain:** golden-file operator tests (`tests/domain/prototype/Operator.test.ts`) covering every operator + nesting cases.
- **Repository:** Zod schema fuzz + valid/malformed `prototype.md` fixtures under `tests/infrastructure/prototype/__fixtures__/`.
- **Adapters:** `fakeModulePorts` + table-driven inputs.
- **UI:** PageObject per block (`Card.po.ts`, `List.po.ts`, …) under `tests/ui/prototype/blocks/`. Mounted via `@vue/test-utils` with MockBridge.
- **Integration:** end-to-end "load → render → click → state mutates → block re-renders" via `PrototypeView.po.ts`.
- Coverage thresholds 80/70/80/80 (existing gate).

## 9. Workflow integration

- **Artifact:** `specs/{slug}/prototype.md` — sibling to `idea.md` / `spec.md` / etc. Not a new stage. No `FEATURE_STEPS` change.
- **Repository:** `FeatureRepository.readPrototype(slug)` / `writePrototype(slug, config)`. Overwrite-protected per AVS-005.
- **View entry:** command palette `Specorator: Open Prototype` + button on workflow nav. Opens new Obsidian tab with `PrototypeView`.
- **CCS reuse:** prototype.md edits flow through Claude CLI Chat Sidebar's existing write-proposal review card. Zero new AI infrastructure.
- **Settings:** `PluginSettings.enablePrototypes: boolean` (default `false`). Feature-flagged for safe rollout.

## 10. Out of scope (deferred)

- Custom user-authored blocks (composition templates or `.vue` loading)
- HTTP / fetch adapter; auth and secrets
- Standalone export to runnable Vite repo
- Visual / drag-and-drop block editor
- Multi-user / real-time collaboration
- `_js` operator (QuickJS-emscripten sandbox)
- Date math, regex, server-only operators

## 11. Open questions for next stage (research)

1. Tab vs pane integration with the existing workflow view.
2. Hot-reload contract on external `prototype.md` edits (`MetadataCachePort.onFileChange` vs explicit reload).
3. Whether the AI proposal review card needs prototype-specific block-diff rendering, or the existing markdown diff suffices for v1.
4. Caching strategy: re-resolve data on every view mount, or cache per session.

## 12. References

- [Lowdefy GitHub](https://github.com/lowdefy/lowdefy)
- [Lowdefy blocks schema](https://github.com/lowdefy/lowdefy/blob/main/packages/docs/concepts/blocks.yaml)
- [Lowdefy operators](https://github.com/lowdefy/lowdefy/blob/main/packages/docs/concepts/operators.yaml)
- [Lowdefy events / actions](https://github.com/lowdefy/lowdefy/blob/main/packages/docs/concepts/events-and-actions.yaml)
- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/) — frontmatter + Zod pattern
- [JSON-e operators](https://json-e.js.org/operators.html) — operator-object dialect prior art
- [FormKit Schema](https://formkit.com/guides/create-a-custom-input) — Vue-3 schema-driven form prior art
- [Formily Vue](https://github.com/alibaba/formily) — multi-framework schema engine
- [JSONForms Vue](https://jsonforms.io/api/vue/) — `tester + renderer` registry pattern

## 13. Spec self-review

- **Placeholders:** none. All sections populated.
- **Internal consistency:** schema example uses `_format` and `_data`, both listed in operator table; block types in example (`List`, `Card`) appear in the block library. Consistent.
- **Scope:** focused on a single feature with clear v1/deferred split. Single-plan implementable.
- **Ambiguity:** open questions explicitly enumerated for the research stage rather than left implicit.
