# Design: MCP Workflow Tools (Issue #192)

**Date:** 2026-05-10  
**Issue:** #192 — feat(plugin-shell): MCP server — workflow tools (6 tools)  
**Parent:** #184 (Obsidian MCP server)  
**Depends on:** #189 ✅ (scaffold — merged)  
**Write tools blocked on:** #191 (PendingProposal mechanism)

---

## Scope

Add 6 workflow tools to the existing `ObsidianMcpServerAdapter`. These tools expose Specorator's core domain to agents via the MCP HTTP endpoint at `http://127.0.0.1:{port}/mcp`.

- 4 read tools: delegate to `IFeatureRepository` + `FEATURE_STEPS` metadata
- 2 write tools: stub using `ProposalStore` no-op queue until #191 ships

---

## Architecture

### Constructor change

`ObsidianMcpServerAdapter` gains two new required constructor arguments:

```ts
constructor(
  private readonly vault: VaultPort,
  private readonly repo: IFeatureRepository,
  private readonly specsFolder: string,
)
```

**Call site in `main.ts`:**
```ts
new ObsidianMcpServerAdapter(
  this.bridge,
  new FeatureRepository(this.bridge, this.bridge, this.settings),
  this.settings.specsFolder,
)
```

`FeatureRepository` is already in the infrastructure layer — `main.ts` (infrastructure owner) is the correct place to instantiate it. Settings are snapshotted at plugin load time; `specsFolder` changes require a restart (acceptable for v1).

### Tool registration

A new `registerWorkflowTools(mcp, repo, vault, store, specsFolder)` function is added alongside the existing `registerTools()` in `ObsidianMcpServerAdapter.ts`. Both are called from `_handleMcpRequest`.

`specsFolder` is passed as a plain string so `registerWorkflowTools` can build vault paths for `workflow_get_stage_artifacts` without duplicating `FeatureRepository`'s path logic.

---

## Tools

### `workflow_get_state`

| | |
|---|---|
| **Type** | Read |
| **Input** | `{ slug: string }` |
| **Output** | `FeaturePlainObject` |
| **Delegates to** | `repo.findBySlug(slug)` → `feature.toPlainObject()` |
| **Error** | Throws if slug not found → MCP `isError: true` |

Returns the full feature DTO including `id`, `slug`, `title`, `area`, `status`, `currentStep`, `createdAt`, `updatedAt`.

---

### `workflow_list_features`

| | |
|---|---|
| **Type** | Read |
| **Input** | _(none)_ |
| **Output** | `{ features: Array<{ slug: string, stage: string, title: string }> }` |
| **Delegates to** | `repo.findAll()` |
| **Error** | Infrastructure errors bubble naturally |

`stage` is derived from `getStepMeta(feature.currentStep)?.slug ?? 'unknown'`.

---

### `workflow_get_stage_artifacts`

| | |
|---|---|
| **Type** | Read |
| **Input** | `{ slug: string }` |
| **Output** | `{ stage: string, artifacts: Array<{ slug: string, path: string, exists: boolean }> }` |
| **Delegates to** | `repo.findBySlug()` + `vault.fileExists()` per stage file |
| **Error** | Throws if slug not found |

Logic:
1. `repo.findBySlug(slug)` → get feature, read `currentStep`
2. `getStepMeta(currentStep)` → current stage slug (used as `stage` in response)
3. For all 12 `FEATURE_STEPS`, build path `{specsFolder}/{slug}/{stepSlug}.md` and call `vault.fileExists()`
4. Return full artifact map (all 12 stages, not just current)

Path construction uses `specsFolder` (held by the adapter — see Architecture section) mirroring `FeatureRepository.stagePath()` without coupling to it.

---

### `workflow_get_quality_gates`

| | |
|---|---|
| **Type** | Read |
| **Input** | _(none)_ |
| **Output** | `{ gates: Array<{ number: number, slug: string, fileName: string }> }` |
| **Delegates to** | `getAllStepMeta()` from `FeatureStep.ts` — pure static data, no ports needed |
| **Error** | None possible |

Returns all 12 stage definitions as an ordered list. Agents use this to understand the full workflow shape.

---

### `workflow_create_artifact` _(stub)_

| | |
|---|---|
| **Type** | Write → queue (no-op) |
| **Input** | `{ slug: string, stage: string }` |
| **Output** | `{ proposalId: string, status: 'pending' }` |
| **Behavior** | `store.queue('workflow_create_artifact', { slug, stage }, async () => {})` |

No-op mutate until #191 ships. The proposal is queryable via `getProposals()` and accept/reject work (accept runs the no-op).

---

### `workflow_propose_advance` _(stub)_

| | |
|---|---|
| **Type** | Write → queue (no-op) |
| **Input** | `{ slug: string }` |
| **Output** | `{ proposalId: string, status: 'pending' }` |
| **Behavior** | `store.queue('workflow_propose_advance', { slug }, async () => {})` |

Same no-op pattern as `workflow_create_artifact`.

---

## Error Handling

- Read tools: slug not found → `throw new Error(...)` inside handler; MCP SDK catches and returns `isError: true` response
- No extra try/catch wrappers needed — SDK handles them
- `workflow_list_features` and `workflow_get_quality_gates` have no domain errors; infrastructure errors bubble as MCP errors naturally

---

## Testing

### New file

`tests/infrastructure/obsidian-mcp-server-adapter-workflow-tools.test.ts`

Pattern mirrors `obsidian-mcp-server-adapter-tools.test.ts`:
- `MockBridge` seeded with valid `workflow-state.md` fixtures for at least 2 features
- `beforeEach`: construct adapter with `MockBridge` + in-memory `FeatureRepository`, start, `initialize`
- `afterEach`: stop adapter

**Coverage per tool:**

| Tool | Cases |
|---|---|
| `workflow_get_state` | happy path (returns correct DTO), slug not found (isError) |
| `workflow_list_features` | returns correct shape for all features, empty vault returns `[]` |
| `workflow_get_stage_artifacts` | returns all 12 artifacts with correct exists flags, slug not found (isError) |
| `workflow_get_quality_gates` | returns all 12 gates in order |
| `workflow_create_artifact` | returns pending receipt, vault unchanged |
| `workflow_propose_advance` | returns pending receipt, vault unchanged |

### Updated file

`tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts` — update `tools/list` assertion from 10 to 16.

### Acceptance criteria mapping

| Criterion | Covered by |
|---|---|
| All 6 tools registered at `/mcp` | `tools/list` test (16 total) |
| `workflow_get_state` returns full DTO | happy path test |
| `workflow_list_features` returns `{ slug, stage, title }[]` | list test |
| `workflow_get_stage_artifacts` returns `{ stage, artifacts }` | artifact test |
| `workflow_get_quality_gates` returns gate defs from `FEATURE_STEPS` | gates test |
| Write tools return `{ proposalId, status: 'pending' }` | stub tests |
| Unit tests for each tool | all above |
| `npm run verify` green | CI gate |
