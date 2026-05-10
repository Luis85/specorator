# MCP Server — Links, Metadata, Canvas, Bases Tools (Issue #193)

**Date:** 2026-05-10
**Status:** Approved (brainstorm)
**Issue:** #193
**Parent:** #184 (Obsidian MCP server)
**Depends on:** #189 ✅ (scaffold), #190 ✅ (vault + frontmatter tools), #191 ✅ (proposal queue), #192 ✅ (workflow tools)
**Related ports:** `MetadataCachePort`, `CanvasPort` (both merged in #182)

## Goal

Extend the Specorator MCP server with 19 tools covering links/graph traversal, JSON Canvas read/write, frontmatter-backed Bases queries, and metadata cache reads. Brings agent total to 36 MCP tools.

## Scope

| Group | Count | Tools |
|---|---|---|
| Metadata | 3 reads | `metadata_get_file_cache`, `metadata_get_all_tags`, `metadata_get_resolved_links` |
| Links & graph | 4 reads + 1 write | `links_get_outgoing`, `links_get_backlinks`, `links_resolve`, `graph_traverse`, `links_add_to_note` |
| Canvas | 1 read + 5 writes | `canvas_read`, `canvas_create`, `canvas_add_text_node`, `canvas_add_file_node`, `canvas_add_edge`, `canvas_update_node` |
| Bases | 4 reads + 1 write | `bases_query`, `bases_list_fields`, `bases_get_record`, `bases_find_by_field`, `bases_update_record` |

All write tools route through the proposal queue (`ProposalStore`) and return `{ proposalId, status: 'pending' }`.

## Architecture

### Port additions

`MetadataCachePort` gains a single new method:

```ts
export interface MetadataCachePort {
  // existing...
  getFirstLinkpathDest(linktext: string, sourcePath: string): string | null
}
```

- `ObsidianMetadataCacheAdapter`: `app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)?.path ?? null`
- `MockMetadataCacheAdapter`: seedable map keyed by `${linktext}|${sourcePath}`, with `seedLinkpathDest(linktext, source, dest)` fluent setter matching existing seed API style

No other port changes. `CanvasPort` already covers JSON Canvas read/write. `VaultPort` covers folder scans for Bases.

### Tool registration shape

`ObsidianMcpServerAdapter._handleMcpRequest` keeps its single `McpServer` per request pattern. Tool registration splits into per-group functions:

```
registerVaultTools(mcp, vault, store)            // existing (#190)
registerWorkflowTools(mcp, repo, vault, store)   // existing (#192)
registerMetadataTools(mcp, metadataCache)        // NEW
registerLinksTools(mcp, vault, metadataCache, store)   // NEW
registerCanvasTools(mcp, canvas, store)          // NEW
registerBasesTools(mcp, vault, store)            // NEW
```

Adapter constructor gains `MetadataCachePort` and `CanvasPort` parameters. `bootstrapModules`/plugin entry point wires them.

### Tool detail

#### Metadata (3 reads)
| Tool | Args | Returns | Implementation |
|---|---|---|---|
| `metadata_get_file_cache` | `{ path }` | `FileMetadataSnapshot \| null` | `metadataCache.getFileMetadata(path)` |
| `metadata_get_all_tags` | `{}` | `Record<string, number>` | `metadataCache.getAllTags()` |
| `metadata_get_resolved_links` | `{ sourcePath }` | `Record<string, number>` | `metadataCache.getResolvedLinks(sourcePath)` |

#### Links & graph (5)
| Tool | Args | Returns | Implementation |
|---|---|---|---|
| `links_get_outgoing` | `{ path }` | `{ links: string[] }` | `metadataCache.getFileMetadata(path).links` |
| `links_get_backlinks` | `{ path }` | `{ backlinks: string[] }` | `metadataCache.getBacklinks(path)` |
| `links_resolve` | `{ linktext, sourcePath }` | `{ resolved: string \| null }` | `metadataCache.getFirstLinkpathDest()` — **in-process, no shell-out** |
| `links_add_to_note` | `{ path, target, displayText? }` | `{ proposalId, status }` | queue: append `\n[[target\|display]]` to file |
| `graph_traverse` | `{ startPath, depth, direction }` | `{ nodes: string[], edges: [from,to][] }` | BFS via outgoing/backlinks. `direction = outgoing\|backlinks\|both`. Depth cap = 5. Cycle-safe via visited set. |

#### Canvas (6)
JSON Canvas spec: https://github.com/obsidianmd/jsoncanvas

| Tool | Args | Returns | Implementation |
|---|---|---|---|
| `canvas_read` | `{ path }` | `JsonCanvasData` | `canvas.readCanvas(path)` |
| `canvas_create` | `{ path, data? }` | `{ proposalId, status }` | queue write of `data ?? { nodes:[], edges:[] }` |
| `canvas_add_text_node` | `{ path, node: { id, x, y, width, height, text, color? } }` | `{ proposalId, status }` | queue: read → push `{type:'text', ...node}` → write |
| `canvas_add_file_node` | `{ path, node: { id, x, y, width, height, file, subpath?, color? } }` | `{ proposalId, status }` | queue: read → push `{type:'file', ...node}` → write |
| `canvas_add_edge` | `{ path, edge: { id, fromNode, toNode, fromSide?, toSide?, label?, color? } }` | `{ proposalId, status }` | queue: read → push edge → write |
| `canvas_update_node` | `{ path, id, patch }` | `{ proposalId, status }` | queue: read → find node by id → shallow merge `patch` → write |

Canvas write tools validate node/edge shape against JSON Canvas spec (zod schema rejecting unknown `type`, missing required fields) before queueing.

#### Bases (5)
Folder-as-base, frontmatter-as-record. Ignores `.base` JSON files (out of scope for this issue).

| Tool | Args | Returns | Implementation |
|---|---|---|---|
| `bases_query` | `{ folder, filter? }` | `{ records: [{path, frontmatter}] }` | list `vault.listFiles(folder)` recursive, parse fm, apply optional `filter = { field, op, value }` (`op = eq\|neq\|contains\|in`) |
| `bases_list_fields` | `{ folder }` | `{ fields: string[] }` | union of frontmatter keys across folder |
| `bases_get_record` | `{ path }` | `{ frontmatter }` | wraps `frontmatter_get` |
| `bases_find_by_field` | `{ folder, field, value }` | `{ records }` | shorthand for `bases_query` with `op: 'eq'` |
| `bases_update_record` | `{ path, fields }` | `{ proposalId, status }` | queue → wraps `frontmatter_set_many` |

## Test strategy

Unit tests per group under `tests/infrastructure/obsidian/`:
- `ObsidianMcpServerAdapter.metadata.test.ts`
- `ObsidianMcpServerAdapter.links.test.ts`
- `ObsidianMcpServerAdapter.canvas.test.ts`
- `ObsidianMcpServerAdapter.bases.test.ts`

Pattern: start real `ObsidianMcpServerAdapter` with mock ports (`MockBridge` + `MockMetadataCacheAdapter` + `MockCanvasAdapter`), connect MCP SDK client over HTTP to assigned port, exercise tool, assert.

Coverage cases:
- Reads: happy path + missing-file path
- Writes: returns `{proposalId, status: 'pending'}`, proposal lands in `ProposalStore.getAll()`, `accept(id)` executes effect
- `links_resolve`: spy on `getFirstLinkpathDest` (NOT a CLI call)
- `graph_traverse`: depth cap, cycle handling
- Canvas writes: zod schema rejects malformed payloads with descriptive error
- `bases_query` filter ops: `eq`, `neq`, `contains`, `in`

Mock additions: `MockMetadataCacheAdapter.seedLinkpathDest(linktext, source, dest)`.

Verify gate: meet existing 80/70/80/80 statements/branches/functions/lines coverage thresholds.

## PR sequencing

| PR | Branch | Scope | Tools |
|---|---|---|---|
| PR1 | `feat/mcp-tools-193-metadata-links` | Metadata + Links groups + port addition | 8 |
| PR2 | `feat/mcp-tools-193-canvas` | Canvas group | 6 |
| PR3 | `feat/mcp-tools-193-bases` | Bases group | 5 |

All branch off `develop`, target `develop`. Issue #193 closes with PR3 merge. PR1 carries the `MetadataCachePort.getFirstLinkpathDest` addition (others reuse existing port surface).

## Acceptance criteria (from issue #193)

- [ ] All 19 tools registered and reachable at `http://localhost:{port}/mcp`
- [ ] `links_resolve` uses `MetadataCachePort.getFirstLinkpathDest()` — not CLI shell-out
- [ ] Canvas write tools and `links_add_to_note` and `bases_update_record` return `{ proposalId, status: 'pending' }`
- [ ] Unit tests for each tool group
- [ ] `npm run verify` green

## Out of scope

- `.base` JSON file parsing (Obsidian Bases plugin format) — folder scan only
- Bases write paths beyond `frontmatter_set_many` reuse
- Live agent integration / chat sidebar wiring (handled by parent #184)
- Performance tuning of recursive folder scans (revisit if user reports issue)
