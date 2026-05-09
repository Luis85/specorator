# W13-D1: Narrow Ports — MetadataCachePort, CanvasPort, WorkspacePort Extensions

**Issue:** #182  
**Parent epic:** #163 (W13)  
**Date:** 2026-05-09  
**Status:** Approved

---

## Scope

Add three new narrow ports to `src/domain/ports/`, their Obsidian adapters, mock adapters, InjectionKey symbols, and composables. No wiring in `main.ts` — that is deferred to #161 (Claude CLI Chat Sidebar), which is the first consumer.

Out of scope: MCP server (#184), URI dispatch (#183), Vue component consumers.

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Adapter style | Standalone classes (not folded into ObsidianBridge) | Start breaking monolith; each adapter has single responsibility |
| main.ts wiring | Deferred to #161 | No consumer exists yet; dead provides add noise |
| WorkspacePort extension | Extended in-place in ObsidianBridge + MockBridge | Already lives there; additive change |
| Unsubscriber type | Shared `src/domain/ports/shared.ts` | Needed by MetadataCachePort and WorkspacePort; will be needed by D2 too |

---

## Architecture

### New files

```
src/domain/ports/
  shared.ts                              ← Unsubscriber type
  metadata-cache-port.ts                 ← MetadataCachePort + FileMetadataSnapshot
  canvas-port.ts                         ← CanvasPort + JsonCanvasData

src/infrastructure/obsidian/
  ObsidianMetadataCacheAdapter.ts        ← wraps app.metadataCache
  ObsidianCanvasAdapter.ts               ← delegates to VaultPort

src/infrastructure/mock/
  MockMetadataCacheAdapter.ts            ← fixture-based, triggerChange()
  MockCanvasAdapter.ts                   ← in-memory store

src/ui/composables/
  useMetadataCachePort.ts
  useCanvasPort.ts
```

### Modified files

```
src/domain/ports/WorkspacePort.ts        ← + ActiveFileSnapshot, getActiveFile(), onActiveFileChanged()
src/domain/ports/index.ts               ← + new exports
src/infrastructure/bridge/ports.ts      ← + METADATA_CACHE_PORT, CANVAS_PORT
src/infrastructure/obsidian/ObsidianBridge.ts  ← + getActiveFile(), onActiveFileChanged()
src/infrastructure/mock/MockBridge.ts   ← + getActiveFile(), onActiveFileChanged(), setActiveFile()
tests/__fakes__/fake-ports.ts           ← + metadataCache, canvas fields
```

---

## Port Interfaces

### `src/domain/ports/shared.ts`

```ts
export type Unsubscriber = () => void
```

### `src/domain/ports/metadata-cache-port.ts`

```ts
import type { Unsubscriber } from './shared'

export interface FileMetadataSnapshot {
  path: string
  tags: string[]
  frontmatter: Record<string, unknown>
  links: string[]
  embeds: string[]
}

export interface MetadataCachePort {
  getFileMetadata(path: string): FileMetadataSnapshot | null
  getBacklinks(path: string): string[]
  getResolvedLinks(sourcePath: string): Record<string, number>
  getAllTags(): Record<string, number>
  onMetadataChanged(handler: (path: string) => void): Unsubscriber
}
```

### `src/domain/ports/canvas-port.ts`

```ts
export interface JsonCanvasData {
  nodes?: unknown[]
  edges?: unknown[]
}

export interface CanvasPort {
  isCanvas(path: string): boolean
  readCanvas(path: string): Promise<JsonCanvasData>
  writeCanvas(path: string, data: JsonCanvasData): Promise<void>
}
```

### `src/domain/ports/WorkspacePort.ts` (extended)

```ts
import type { Unsubscriber } from './shared'

export interface ActiveFileSnapshot {
  path: string
  basename: string
  extension: string
}

export interface WorkspacePort {
  openFile(path: string): Promise<void>
  getActiveFile(): ActiveFileSnapshot | null
  onActiveFileChanged(handler: (file: ActiveFileSnapshot | null) => void): Unsubscriber
}
```

---

## Obsidian Adapters

### `ObsidianMetadataCacheAdapter`

- Constructor: `constructor(private readonly app: App)`
- `getFileMetadata`: reads `app.metadataCache.getFileCache(file)` — returns `null` if not cached
- `getBacklinks`: inverse map from `app.metadataCache.resolvedLinks`
- `getResolvedLinks`: reads `app.metadataCache.resolvedLinks[sourcePath]`
- `getAllTags`: delegates to `app.metadataCache.getTags()`
- `onMetadataChanged`: `app.metadataCache.on('changed', ...)` returns `EventRef` — unsubscriber calls `app.metadataCache.offref(ref)`

### `ObsidianCanvasAdapter`

- Constructor: `constructor(private readonly vault: VaultPort)`
- `isCanvas(path)`: `path.endsWith('.canvas')`
- `readCanvas`: `vault.readFile(path)` → `JSON.parse`
- `writeCanvas`: `JSON.stringify(data, null, 2)` → `vault.writeFile(path, ...)`

Taking `VaultPort` (not `App`) keeps this adapter testable without Obsidian.

### `ObsidianBridge` additions

```ts
getActiveFile(): ActiveFileSnapshot | null {
  const file = this.app.workspace.getActiveFile()
  if (!file) return null
  return { path: file.path, basename: file.basename, extension: file.extension }
}

onActiveFileChanged(handler: (file: ActiveFileSnapshot | null) => void): Unsubscriber {
  const ref = this.app.workspace.on('active-leaf-change', () => {
    handler(this.getActiveFile())
  })
  return () => this.app.workspace.offref(ref)
}
```

---

## Mock Adapters

### `MockMetadataCacheAdapter`

```ts
class MockMetadataCacheAdapter implements MetadataCachePort {
  // Seed helpers (test-only)
  seedMetadata(path: string, snapshot: FileMetadataSnapshot): void
  seedBacklinks(path: string, sources: string[]): void
  seedResolvedLinks(path: string, links: Record<string, number>): void
  seedTags(tags: Record<string, number>): void
  triggerChange(path: string): void  // fires all registered onMetadataChanged handlers

  // Port
  getFileMetadata(path: string): FileMetadataSnapshot | null
  getBacklinks(path: string): string[]
  getResolvedLinks(sourcePath: string): Record<string, number>
  getAllTags(): Record<string, number>
  onMetadataChanged(handler: (path: string) => void): Unsubscriber
    // unsubscriber: () => handlers.delete(handler)
}
```

### `MockCanvasAdapter`

```ts
class MockCanvasAdapter implements CanvasPort {
  seedCanvas(path: string, data: JsonCanvasData): void
  getWritten(path: string): JsonCanvasData | undefined  // inspect writes in tests

  isCanvas(path: string): boolean
  async readCanvas(path: string): Promise<JsonCanvasData>
    // throws Error(`[MockCanvasAdapter] Canvas not found: ${path}`) if not seeded
  async writeCanvas(path: string, data: JsonCanvasData): Promise<void>
}
```

### `MockBridge` additions

```ts
// New state
private activeFile: ActiveFileSnapshot | null = null
private readonly activeFileHandlers = new Set<(f: ActiveFileSnapshot | null) => void>()

// WorkspacePort additions
getActiveFile(): ActiveFileSnapshot | null
onActiveFileChanged(handler: (f: ActiveFileSnapshot | null) => void): Unsubscriber

// Test helper
setActiveFile(file: ActiveFileSnapshot | null): void
  // stores value, fires all handlers
```

---

## InjectionKeys

`src/infrastructure/bridge/ports.ts` additions:

```ts
export const METADATA_CACHE_PORT: InjectionKey<MetadataCachePort> = Symbol('MetadataCachePort')
export const CANVAS_PORT: InjectionKey<CanvasPort> = Symbol('CanvasPort')
```

`WORKSPACE_PORT` already exists — no new symbol needed.

---

## Composables

`src/ui/composables/useMetadataCachePort.ts` and `useCanvasPort.ts` follow the existing pattern:

```ts
export function useMetadataCachePort(): MetadataCachePort {
  const port = inject(METADATA_CACHE_PORT)
  if (!port) throw new Error('MetadataCachePort not provided')
  return port
}
```

`useWorkspacePort.ts` already exists and needs no changes — the interface extension is transparent to the composable.

---

## Fake-ports factory

`tests/__fakes__/fake-ports.ts`:

```ts
export interface FakePorts {
  // ... existing fields ...
  readonly metadataCache: MockMetadataCacheAdapter
  readonly canvas: MockCanvasAdapter
}

export function fakeModulePorts(): FakePorts {
  // ... existing wiring ...
  const metadataCache = new MockMetadataCacheAdapter()
  const canvas = new MockCanvasAdapter()
  return {
    ...existing,
    metadataCache,
    canvas,
  }
}
```

---

## Tests

| File | What it covers |
|---|---|
| `tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts` | seed/read all fields; `triggerChange` fires handlers; unsubscriber removes handler only |
| `tests/infrastructure/mock/MockCanvasAdapter.test.ts` | round-trip read/write; `getWritten`; throws on missing path; `isCanvas` |
| `tests/infrastructure/mock/MockBridge.test.ts` (extended) | `setActiveFile` fires handlers; unsubscriber cleans up; `getActiveFile` returns seeded value |
| `tests/infrastructure/obsidian/ObsidianCanvasAdapter.test.ts` | uses `MockBridge` as `VaultPort`; round-trip; `isCanvas` |

`ObsidianMetadataCacheAdapter` and `ObsidianBridge` Obsidian-side tests excluded from coverage scope per CLAUDE.md (`src/infrastructure/obsidian/**` excluded).

---

## Acceptance Criteria

- [ ] `MetadataCachePort`, `CanvasPort` defined; `WorkspacePort` extended with `ActiveFileSnapshot`, `getActiveFile()`, `onActiveFileChanged()`
- [ ] `Unsubscriber` in `src/domain/ports/shared.ts`, exported from `index.ts`
- [ ] `ObsidianMetadataCacheAdapter`, `ObsidianCanvasAdapter` implemented as standalone classes
- [ ] `ObsidianBridge` implements new `WorkspacePort` methods
- [ ] `MockMetadataCacheAdapter` with `triggerChange()` test helper
- [ ] `MockCanvasAdapter` with `getWritten()` test helper
- [ ] `MockBridge` with `setActiveFile()` test helper
- [ ] `METADATA_CACHE_PORT`, `CANVAS_PORT` InjectionKey symbols added
- [ ] `useMetadataCachePort`, `useCanvasPort` composables added
- [ ] `FakePorts` + `fakeModulePorts()` updated
- [ ] All four test files passing
- [ ] `npm run verify` green
