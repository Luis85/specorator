# PendingProposal Mechanism — Design

**Issue:** #191  
**Date:** 2026-05-10  
**Status:** Approved

---

## Problem

MCP write tools must not mutate the vault directly. Every write must be queued as a proposal, reviewed by the user in the chat sidebar, and either accepted (vault mutated) or rejected (vault unchanged).

---

## Scope

This issue delivers the queue/accept/reject infrastructure for the four write tools currently stubbed in `ObsidianMcpServerAdapter`:

- `vault_write_note`
- `vault_append_to_note`
- `frontmatter_set_field`
- `frontmatter_set_many`

Future write tool groups (#190, #192, #193) follow the same pattern.

---

## Architecture

### Approach: `ProposalStore` class (Approach B)

The proposal store is extracted to its own class (`ProposalStore`) rather than inlined on the adapter. This keeps the adapter responsible for HTTP/transport only, and makes the store unit-testable without spinning up an HTTP server.

```
ObsidianMcpServerAdapter
  └─ ProposalStore (private, instance-level)
       └─ Map<proposalId, ProposalEntry>

registerTools(mcp, vault, store)
  └─ write tools call store.queue(toolName, params, mutateFn)
```

The store is instance-level on `ObsidianMcpServerAdapter` — shared across all requests. Each HTTP request creates a fresh `McpServer` but passes the same store, so proposals queued in one request are accessible to `acceptProposal` / `rejectProposal` called from outside (e.g. the chat sidebar).

---

## Types

### `PendingProposal` (exported)

```ts
export type PendingProposal = {
  proposalId: string
  toolName: string
  params: unknown
  status: 'pending' | 'accepted' | 'rejected'
}
```

Defined in `src/infrastructure/obsidian/ProposalStore.ts`. Exported for sidebar consumption. Not added to `ObsidianMcpServerPort` — internal to the adapter layer.

### `ProposalEntry` (internal)

```ts
type ProposalEntry = PendingProposal & { mutate: () => Promise<void> }
```

Not exported. The `mutate` closure is captured at queue time and called on accept. Never surfaces to callers of `getAll()` or `get()`.

---

## `ProposalStore`

**File:** `src/infrastructure/obsidian/ProposalStore.ts`

```ts
import { randomUUID } from 'node:crypto'

export class ProposalStore {
  private readonly entries = new Map<string, ProposalEntry>()

  queue(toolName: string, params: unknown, mutate: () => Promise<void>): string {
    const proposalId = randomUUID()
    this.entries.set(proposalId, { proposalId, toolName, params, status: 'pending', mutate })
    return proposalId
  }

  async accept(proposalId: string): Promise<void> {
    const entry = this.#getOrThrow(proposalId)
    this.#assertPending(entry)
    await entry.mutate()
    entry.status = 'accepted'
  }

  reject(proposalId: string): void {
    const entry = this.#getOrThrow(proposalId)
    this.#assertPending(entry)
    entry.status = 'rejected'
  }

  getAll(): ReadonlyArray<PendingProposal> {
    return Array.from(this.entries.values()).map(({ mutate: _m, ...rest }) => rest)
  }

  get(proposalId: string): PendingProposal | undefined {
    const entry = this.entries.get(proposalId)
    if (!entry) return undefined
    const { mutate: _m, ...rest } = entry
    return rest
  }

  #getOrThrow(proposalId: string): ProposalEntry {
    const entry = this.entries.get(proposalId)
    if (!entry) throw new Error(`Unknown proposal: ${proposalId}`)
    return entry
  }

  #assertPending(entry: ProposalEntry): void {
    if (entry.status !== 'pending')
      throw new Error(`Proposal not pending: ${entry.proposalId} (${entry.status})`)
  }
}
```

---

## `registerTools` changes

Signature gains a third param: `store: ProposalStore`.

Write tools replace the hardcoded stub with `store.queue()`, capturing the vault mutation as a closure:

```ts
// vault_write_note
async ({ path, content }) => {
  const proposalId = store.queue('vault_write_note', { path, content },
    () => vault.writeFile(path, content))
  return ok({ proposalId, status: 'pending' })
}

// vault_append_to_note
async ({ path, content }) => {
  const proposalId = store.queue('vault_append_to_note', { path, content }, async () => {
    const existing = await vault.readFile(path)
    await vault.writeFile(path, existing + content)
  })
  return ok({ proposalId, status: 'pending' })
}

// frontmatter_set_field
async ({ path, field, value }) => {
  const proposalId = store.queue('frontmatter_set_field', { path, field, value },
    () => applyFrontmatterUpdate(vault, path, { [field]: value }))
  return ok({ proposalId, status: 'pending' })
}

// frontmatter_set_many
async ({ path, fields }) => {
  const proposalId = store.queue('frontmatter_set_many', { path, fields },
    () => applyFrontmatterUpdate(vault, path, fields))
  return ok({ proposalId, status: 'pending' })
}
```

### `applyFrontmatterUpdate` helper

Module-level in `ObsidianMcpServerAdapter.ts`:

```ts
async function applyFrontmatterUpdate(
  vault: VaultPort,
  path: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const content = await vault.readFile(path)
  const existing = parseFrontmatter(content)
  const merged = { ...existing, ...updates }
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  await vault.writeFile(path, `---\n${stringifyYaml(merged)}---\n${body}`)
}
```

Import `stringify as stringifyYaml` from `yaml` (already a dependency).

---

## `ObsidianMcpServerAdapter` changes

```ts
export class ObsidianMcpServerAdapter implements ObsidianMcpServerPort {
  private readonly proposalStore = new ProposalStore()
  // ... existing fields

  async acceptProposal(proposalId: string): Promise<void> {
    await this.proposalStore.accept(proposalId)
  }

  rejectProposal(proposalId: string): void {
    this.proposalStore.reject(proposalId)
  }

  getProposals(): ReadonlyArray<PendingProposal> {
    return this.proposalStore.getAll()
  }

  // _handleMcpRequest: registerTools(mcp, this.vault, this.proposalStore)
  // start / stop / getConnectionConfig: unchanged
}
```

`acceptProposal`, `rejectProposal`, `getProposals` are public on the concrete class but NOT added to `ObsidianMcpServerPort`. The `STUB_PROPOSAL_ID` constant is deleted.

---

## Files changed

| File | Action |
|---|---|
| `src/infrastructure/obsidian/ProposalStore.ts` | New |
| `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts` | Updated |
| `tests/infrastructure/proposal-store.test.ts` | New |
| `tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts` | Updated |

---

## Testing

### `tests/infrastructure/proposal-store.test.ts` (pure, no HTTP)

| Test | Assertion |
|---|---|
| `queue()` returns string id | `typeof id === 'string'` |
| `getAll()` returns proposal with status `'pending'` | shape matches `PendingProposal` |
| `get(id)` returns proposal; `get(unknown)` → `undefined` | lookup correctness |
| `accept()` calls mutate fn, status → `'accepted'` | spy on mutate called once |
| `reject()` status → `'rejected'`, mutate NOT called | spy on mutate never called |
| `accept()` on already-accepted throws | error message contains id |
| `reject()` on already-rejected throws | error message contains id |
| `accept()` / `reject()` on unknown id throw | error message contains id |
| `getAll()` does not expose `mutate` property | key not present in result |

### `tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts` (HTTP integration)

Write tool tests updated — stop asserting stub constant, start asserting real behavior:

```ts
// Pattern for each write tool:
// 1. call tool → get proposalId, assert status 'pending'
// 2. assert vault NOT yet mutated
// 3. adapter.acceptProposal(proposalId) → assert vault IS mutated
// 4. (separate test) adapter.rejectProposal(proposalId) → assert vault unchanged
```

Frontmatter tests verify merged fields via `parseFrontmatter` after accept.

---

## Acceptance criteria mapping

| AC | Covered by |
|---|---|
| `PendingProposal` type defined | `ProposalStore.ts` export |
| In-memory store inside adapter layer | `ProposalStore` held on adapter instance |
| Write tools return `{ proposalId, status: 'pending' }` | `registerTools` update |
| `acceptProposal()` applies mutation, status `'accepted'` | `ProposalStore.accept()` + adapter method |
| `rejectProposal()` sets `'rejected'`, vault unchanged | `ProposalStore.reject()` + adapter method |
| Store accessible to sidebar (read-only accessor) | `adapter.getProposals()` |
| Unit tests: queue, accept, reject | `proposal-store.test.ts` |
| `npm run verify` green | all tests + typecheck + lint |
