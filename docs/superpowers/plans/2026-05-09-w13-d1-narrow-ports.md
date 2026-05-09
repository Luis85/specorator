# W13-D1: Narrow Ports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MetadataCachePort, CanvasPort, and WorkspacePort extensions (getActiveFile, onActiveFileChanged) with standalone Obsidian adapters, mock adapters, InjectionKey symbols, composables, and tests.

**Architecture:** Three new narrow ports in `src/domain/ports/`, each with a standalone Obsidian adapter (not folded into ObsidianBridge) and a fixture-based mock adapter. WorkspacePort is extended in-place; ObsidianBridge and MockBridge get the two new WorkspacePort methods directly. No wiring in main.ts — deferred to #161.

**Tech Stack:** TypeScript, Vitest, Vue 3 inject/provide, Obsidian API (MetadataCache, Workspace events)

---

## File Map

### Created
- `src/domain/ports/shared.ts` — `Unsubscriber` type
- `src/domain/ports/metadata-cache-port.ts` — `MetadataCachePort`, `FileMetadataSnapshot`
- `src/domain/ports/canvas-port.ts` — `CanvasPort`, `JsonCanvasData`
- `src/infrastructure/obsidian/ObsidianMetadataCacheAdapter.ts` — wraps `app.metadataCache`
- `src/infrastructure/obsidian/ObsidianCanvasAdapter.ts` — delegates to `VaultPort`
- `src/infrastructure/mock/MockMetadataCacheAdapter.ts` — fixture-based, `triggerChange()`
- `src/infrastructure/mock/MockCanvasAdapter.ts` — in-memory store, `getWritten()`
- `src/ui/composables/useMetadataCachePort.ts`
- `src/ui/composables/useCanvasPort.ts`
- `tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts`
- `tests/infrastructure/mock/MockCanvasAdapter.test.ts`
- `tests/infrastructure/obsidian/ObsidianCanvasAdapter.test.ts`

### Modified
- `src/domain/ports/WorkspacePort.ts` — add `ActiveFileSnapshot`, `getActiveFile()`, `onActiveFileChanged()`
- `src/domain/ports/index.ts` — add new exports
- `src/infrastructure/bridge/ports.ts` — add `METADATA_CACHE_PORT`, `CANVAS_PORT`
- `src/infrastructure/obsidian/ObsidianBridge.ts` — implement new WorkspacePort methods
- `src/infrastructure/mock/MockBridge.ts` — implement new WorkspacePort methods + `setActiveFile()`
- `src/infrastructure/localstorage/LocalStorageBridge.ts` — implement new WorkspacePort methods (no-op)
- `tests/infrastructure/mock/MockBridge.test.ts` — add WorkspacePort active-file tests
- `tests/infrastructure/bridge/WorkspacePortContract.test.ts` — add contract tests for new methods
- `tests/__fakes__/fake-ports.ts` — add `metadataCache`, `canvas` fields

---

## Task 1: Port interfaces

**Files:**
- Create: `src/domain/ports/shared.ts`
- Create: `src/domain/ports/metadata-cache-port.ts`
- Create: `src/domain/ports/canvas-port.ts`
- Modify: `src/domain/ports/WorkspacePort.ts`
- Modify: `src/domain/ports/index.ts`

No runtime behaviour — pure TypeScript types. Compile check is the test.

- [ ] **Step 1: Create `src/domain/ports/shared.ts`**

```ts
export type Unsubscriber = () => void
```

- [ ] **Step 2: Create `src/domain/ports/metadata-cache-port.ts`**

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

- [ ] **Step 3: Create `src/domain/ports/canvas-port.ts`**

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

- [ ] **Step 4: Replace `src/domain/ports/WorkspacePort.ts`**

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

- [ ] **Step 5: Replace `src/domain/ports/index.ts`**

```ts
/**
 * Narrow ports replacing the IBridge aggregate (ADR-008).
 *
 * Consumers depend on one port at a time. Do NOT introduce a new
 * interface that composes two or more of these ports — interface
 * segregation is the whole point of this directory. If a consumer
 * appears to need a "VaultAndNotificationPort", it needs two
 * dependencies, not a new aggregate type.
 */
export type { SettingsPort } from './SettingsPort'
export type { VaultPort } from './VaultPort'
export type { WorkspacePort, ActiveFileSnapshot } from './WorkspacePort'
export type { NotificationPort } from './NotificationPort'
export type { LoggerPort } from './LoggerPort'
export type { TranslationPort } from './TranslationPort'
export type { Unsubscriber } from './shared'
export type { MetadataCachePort, FileMetadataSnapshot } from './metadata-cache-port'
export type { CanvasPort, JsonCanvasData } from './canvas-port'
```

- [ ] **Step 6: Type-check**

```
npm run typecheck
```

Expected: no errors (WorkspacePort now has new methods — ObsidianBridge and the other bridges will fail typecheck until Tasks 2–3 add the implementations). If you see only errors like `Property 'getActiveFile' is missing`, that is expected — they are fixed in the next tasks. If you see unrelated errors, fix them before continuing.

- [ ] **Step 7: Commit**

```
git add src/domain/ports/shared.ts src/domain/ports/metadata-cache-port.ts src/domain/ports/canvas-port.ts src/domain/ports/WorkspacePort.ts src/domain/ports/index.ts
git commit -m "feat(ports): add MetadataCachePort, CanvasPort, extend WorkspacePort"
```

---

## Task 2: MockBridge — WorkspacePort extensions (TDD)

**Files:**
- Modify: `src/infrastructure/mock/MockBridge.ts`
- Modify: `tests/infrastructure/mock/MockBridge.test.ts`
- Modify: `tests/infrastructure/bridge/WorkspacePortContract.test.ts`

- [ ] **Step 1: Add failing tests to `tests/infrastructure/mock/MockBridge.test.ts`**

Replace the import line at the top with:

```ts
import { describe, it, expect, vi } from 'vitest'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
```

Append this `describe` block at the end of the file (after the existing describe block):

```ts
describe('MockBridge — WorkspacePort active file', () => {
  it('getActiveFile returns null when no active file is set', () => {
    const bridge = new MockBridge()
    expect(bridge.getActiveFile()).toBeNull()
  })

  it('getActiveFile returns the snapshot after setActiveFile', () => {
    const bridge = new MockBridge()
    bridge.setActiveFile({ path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' })
    expect(bridge.getActiveFile()).toEqual({
      path: 'specs/foo/idea.md',
      basename: 'idea',
      extension: 'md',
    })
  })

  it('setActiveFile fires registered onActiveFileChanged handlers', () => {
    const bridge = new MockBridge()
    const snapshot = { path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' }
    const handler = vi.fn()
    bridge.onActiveFileChanged(handler)
    bridge.setActiveFile(snapshot)
    expect(handler).toHaveBeenCalledWith(snapshot)
  })

  it('setActiveFile(null) fires handler with null', () => {
    const bridge = new MockBridge()
    const handler = vi.fn()
    bridge.onActiveFileChanged(handler)
    bridge.setActiveFile(null)
    expect(handler).toHaveBeenCalledWith(null)
  })

  it('unsubscriber from onActiveFileChanged stops handler from firing', () => {
    const bridge = new MockBridge()
    const handler = vi.fn()
    const unsub = bridge.onActiveFileChanged(handler)
    unsub()
    bridge.setActiveFile({ path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' })
    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify the tests fail**

```
npx vitest run tests/infrastructure/mock/MockBridge.test.ts
```

Expected: the new tests fail with `TypeError: bridge.getActiveFile is not a function`.

- [ ] **Step 3: Add imports and new members to `src/infrastructure/mock/MockBridge.ts`**

At the top of the file, extend the existing import to include the new types:

```ts
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
  LoggerPort,
  ActiveFileSnapshot,
  Unsubscriber,
} from '@/domain/ports'
```

Add three new private members after the `openedFile` line:

```ts
private activeFile: ActiveFileSnapshot | null = null
private readonly activeFileHandlers = new Set<(f: ActiveFileSnapshot | null) => void>()
```

Add three new methods after the existing `openFile` method:

```ts
getActiveFile(): ActiveFileSnapshot | null {
  return this.activeFile
}

onActiveFileChanged(handler: (f: ActiveFileSnapshot | null) => void): Unsubscriber {
  this.activeFileHandlers.add(handler)
  return () => {
    this.activeFileHandlers.delete(handler)
  }
}

setActiveFile(file: ActiveFileSnapshot | null): void {
  this.activeFile = file
  for (const handler of this.activeFileHandlers) {
    handler(file)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```
npx vitest run tests/infrastructure/mock/MockBridge.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Add contract tests for new WorkspacePort methods**

The file `tests/infrastructure/bridge/WorkspacePortContract.test.ts` tests both `MockBridge` and `LocalStorageBridge` against the `WorkspacePort` interface. Add the following two tests inside the `describe` block in `registerWorkspaceContract` (after the existing `openFile` test):

```ts
it('getActiveFile returns null initially', () => {
  expect(scenario.port.getActiveFile()).toBeNull()
})

it('unsubscriber returned by onActiveFileChanged can be called without error', () => {
  const unsub = scenario.port.onActiveFileChanged(() => {})
  expect(() => unsub()).not.toThrow()
})
```

- [ ] **Step 6: Run contract tests — expect LocalStorageBridge to fail**

```
npx vitest run tests/infrastructure/bridge/WorkspacePortContract.test.ts
```

Expected: MockBridge tests pass, LocalStorageBridge tests fail with `TypeError: ... is not a function`. This is correct — Task 3 fixes LocalStorageBridge.

- [ ] **Step 7: Commit**

```
git add src/infrastructure/mock/MockBridge.ts tests/infrastructure/mock/MockBridge.test.ts tests/infrastructure/bridge/WorkspacePortContract.test.ts
git commit -m "feat(mock): extend MockBridge with WorkspacePort active-file methods"
```

---

## Task 3: LocalStorageBridge — WorkspacePort extensions

**Files:**
- Modify: `src/infrastructure/localstorage/LocalStorageBridge.ts`

`LocalStorageBridge` is a browser-only bridge with no concept of an active file. `getActiveFile` returns `null`; `onActiveFileChanged` returns a no-op unsubscriber.

- [ ] **Step 1: Add imports to `src/infrastructure/localstorage/LocalStorageBridge.ts`**

Extend the existing import:

```ts
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
  LoggerPort,
  ActiveFileSnapshot,
  Unsubscriber,
} from '@/domain/ports'
```

- [ ] **Step 2: Add the two new WorkspacePort methods after `openFile`**

```ts
getActiveFile(): ActiveFileSnapshot | null {
  return null
}

onActiveFileChanged(_handler: (file: ActiveFileSnapshot | null) => void): Unsubscriber {
  return () => {}
}
```

- [ ] **Step 3: Run the contract tests — all should pass**

```
npx vitest run tests/infrastructure/bridge/WorkspacePortContract.test.ts
```

Expected: all tests (MockBridge and LocalStorageBridge variants) pass.

- [ ] **Step 4: Commit**

```
git add src/infrastructure/localstorage/LocalStorageBridge.ts
git commit -m "feat(localstorage): stub WorkspacePort active-file methods on LocalStorageBridge"
```

---

## Task 4: MockMetadataCacheAdapter (TDD)

**Files:**
- Create: `tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts`
- Create: `src/infrastructure/mock/MockMetadataCacheAdapter.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'

describe('MockMetadataCacheAdapter', () => {
  it('getFileMetadata returns null when path not seeded', () => {
    const adapter = new MockMetadataCacheAdapter()
    expect(adapter.getFileMetadata('specs/foo/idea.md')).toBeNull()
  })

  it('getFileMetadata returns seeded snapshot', () => {
    const adapter = new MockMetadataCacheAdapter()
    const snapshot = {
      path: 'specs/foo/idea.md',
      tags: ['#feature'],
      frontmatter: { stage: 'idea' },
      links: ['specs/bar/idea.md'],
      embeds: [],
    }
    adapter.seedMetadata('specs/foo/idea.md', snapshot)
    expect(adapter.getFileMetadata('specs/foo/idea.md')).toEqual(snapshot)
  })

  it('getBacklinks returns empty array when not seeded', () => {
    const adapter = new MockMetadataCacheAdapter()
    expect(adapter.getBacklinks('specs/foo/idea.md')).toEqual([])
  })

  it('getBacklinks returns seeded backlinks', () => {
    const adapter = new MockMetadataCacheAdapter()
    adapter.seedBacklinks('specs/foo/idea.md', ['specs/bar/idea.md', 'specs/baz/idea.md'])
    expect(adapter.getBacklinks('specs/foo/idea.md')).toEqual([
      'specs/bar/idea.md',
      'specs/baz/idea.md',
    ])
  })

  it('getResolvedLinks returns empty object when not seeded', () => {
    const adapter = new MockMetadataCacheAdapter()
    expect(adapter.getResolvedLinks('specs/foo/idea.md')).toEqual({})
  })

  it('getResolvedLinks returns seeded resolved links', () => {
    const adapter = new MockMetadataCacheAdapter()
    adapter.seedResolvedLinks('specs/foo/idea.md', { 'specs/bar/idea.md': 2 })
    expect(adapter.getResolvedLinks('specs/foo/idea.md')).toEqual({ 'specs/bar/idea.md': 2 })
  })

  it('getAllTags returns empty object when not seeded', () => {
    const adapter = new MockMetadataCacheAdapter()
    expect(adapter.getAllTags()).toEqual({})
  })

  it('getAllTags returns seeded tags', () => {
    const adapter = new MockMetadataCacheAdapter()
    adapter.seedTags({ '#feature': 3, '#bug': 1 })
    expect(adapter.getAllTags()).toEqual({ '#feature': 3, '#bug': 1 })
  })

  it('triggerChange fires all registered onMetadataChanged handlers with the path', () => {
    const adapter = new MockMetadataCacheAdapter()
    const handler = vi.fn()
    adapter.onMetadataChanged(handler)
    adapter.triggerChange('specs/foo/idea.md')
    expect(handler).toHaveBeenCalledWith('specs/foo/idea.md')
  })

  it('unsubscriber stops handler from firing', () => {
    const adapter = new MockMetadataCacheAdapter()
    const handler = vi.fn()
    const unsub = adapter.onMetadataChanged(handler)
    unsub()
    adapter.triggerChange('specs/foo/idea.md')
    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscriber removes only its own handler', () => {
    const adapter = new MockMetadataCacheAdapter()
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const unsub1 = adapter.onMetadataChanged(handler1)
    adapter.onMetadataChanged(handler2)
    unsub1()
    adapter.triggerChange('specs/foo/idea.md')
    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).toHaveBeenCalledWith('specs/foo/idea.md')
  })
})
```

- [ ] **Step 2: Run to verify the tests fail**

```
npx vitest run tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts
```

Expected: fail with `Cannot find module '@/infrastructure/mock/MockMetadataCacheAdapter'`.

- [ ] **Step 3: Create `src/infrastructure/mock/MockMetadataCacheAdapter.ts`**

```ts
import type { MetadataCachePort, FileMetadataSnapshot, Unsubscriber } from '@/domain/ports'

export class MockMetadataCacheAdapter implements MetadataCachePort {
  private readonly metadata = new Map<string, FileMetadataSnapshot>()
  private readonly backlinks = new Map<string, string[]>()
  private readonly resolvedLinks = new Map<string, Record<string, number>>()
  private tags: Record<string, number> = {}
  private readonly handlers = new Set<(path: string) => void>()

  seedMetadata(path: string, snapshot: FileMetadataSnapshot): void {
    this.metadata.set(path, snapshot)
  }

  seedBacklinks(path: string, sources: string[]): void {
    this.backlinks.set(path, sources)
  }

  seedResolvedLinks(path: string, links: Record<string, number>): void {
    this.resolvedLinks.set(path, links)
  }

  seedTags(tags: Record<string, number>): void {
    this.tags = { ...tags }
  }

  triggerChange(path: string): void {
    for (const handler of this.handlers) {
      handler(path)
    }
  }

  getFileMetadata(path: string): FileMetadataSnapshot | null {
    return this.metadata.get(path) ?? null
  }

  getBacklinks(path: string): string[] {
    return this.backlinks.get(path) ?? []
  }

  getResolvedLinks(sourcePath: string): Record<string, number> {
    return this.resolvedLinks.get(sourcePath) ?? {}
  }

  getAllTags(): Record<string, number> {
    return { ...this.tags }
  }

  onMetadataChanged(handler: (path: string) => void): Unsubscriber {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }
}
```

- [ ] **Step 4: Run to verify the tests pass**

```
npx vitest run tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts
```

Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```
git add src/infrastructure/mock/MockMetadataCacheAdapter.ts tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts
git commit -m "feat(mock): add MockMetadataCacheAdapter with seed helpers and triggerChange"
```

---

## Task 5: MockCanvasAdapter (TDD)

**Files:**
- Create: `tests/infrastructure/mock/MockCanvasAdapter.test.ts`
- Create: `src/infrastructure/mock/MockCanvasAdapter.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/infrastructure/mock/MockCanvasAdapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MockCanvasAdapter } from '@/infrastructure/mock/MockCanvasAdapter'

describe('MockCanvasAdapter', () => {
  it('isCanvas returns true for .canvas extension', () => {
    const adapter = new MockCanvasAdapter()
    expect(adapter.isCanvas('boards/my-board.canvas')).toBe(true)
  })

  it('isCanvas returns false for other extensions', () => {
    const adapter = new MockCanvasAdapter()
    expect(adapter.isCanvas('specs/foo/idea.md')).toBe(false)
  })

  it('readCanvas throws when path not seeded', async () => {
    const adapter = new MockCanvasAdapter()
    await expect(adapter.readCanvas('boards/missing.canvas')).rejects.toThrow(
      '[MockCanvasAdapter] Canvas not found: boards/missing.canvas',
    )
  })

  it('readCanvas returns seeded data', async () => {
    const adapter = new MockCanvasAdapter()
    const data = { nodes: [{ id: '1' }], edges: [] }
    adapter.seedCanvas('boards/my-board.canvas', data)
    expect(await adapter.readCanvas('boards/my-board.canvas')).toEqual(data)
  })

  it('writeCanvas stores data readable by readCanvas', async () => {
    const adapter = new MockCanvasAdapter()
    const data = { nodes: [], edges: [{ id: 'e1' }] }
    await adapter.writeCanvas('boards/my-board.canvas', data)
    expect(await adapter.readCanvas('boards/my-board.canvas')).toEqual(data)
  })

  it('writeCanvas overwrites previously seeded data', async () => {
    const adapter = new MockCanvasAdapter()
    adapter.seedCanvas('boards/my-board.canvas', { nodes: [] })
    const updated = { nodes: [{ id: 'new' }] }
    await adapter.writeCanvas('boards/my-board.canvas', updated)
    expect(await adapter.readCanvas('boards/my-board.canvas')).toEqual(updated)
  })

  it('getWritten returns undefined for paths not yet written', () => {
    const adapter = new MockCanvasAdapter()
    expect(adapter.getWritten('boards/my-board.canvas')).toBeUndefined()
  })

  it('getWritten returns last written data', async () => {
    const adapter = new MockCanvasAdapter()
    const data = { nodes: [{ id: '2' }] }
    await adapter.writeCanvas('boards/my-board.canvas', data)
    expect(adapter.getWritten('boards/my-board.canvas')).toEqual(data)
  })

  it('getWritten does not return seeded-but-not-written data', () => {
    const adapter = new MockCanvasAdapter()
    adapter.seedCanvas('boards/my-board.canvas', { nodes: [] })
    expect(adapter.getWritten('boards/my-board.canvas')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify the tests fail**

```
npx vitest run tests/infrastructure/mock/MockCanvasAdapter.test.ts
```

Expected: fail with `Cannot find module '@/infrastructure/mock/MockCanvasAdapter'`.

- [ ] **Step 3: Create `src/infrastructure/mock/MockCanvasAdapter.ts`**

```ts
import type { CanvasPort, JsonCanvasData } from '@/domain/ports'

export class MockCanvasAdapter implements CanvasPort {
  private readonly store = new Map<string, JsonCanvasData>()
  private readonly written = new Map<string, JsonCanvasData>()

  seedCanvas(path: string, data: JsonCanvasData): void {
    this.store.set(path, data)
  }

  getWritten(path: string): JsonCanvasData | undefined {
    return this.written.get(path)
  }

  isCanvas(path: string): boolean {
    return path.endsWith('.canvas')
  }

  async readCanvas(path: string): Promise<JsonCanvasData> {
    const data = this.store.get(path)
    if (data === undefined) {
      throw new Error(`[MockCanvasAdapter] Canvas not found: ${path}`)
    }
    return data
  }

  async writeCanvas(path: string, data: JsonCanvasData): Promise<void> {
    this.store.set(path, data)
    this.written.set(path, data)
  }
}
```

- [ ] **Step 4: Run to verify the tests pass**

```
npx vitest run tests/infrastructure/mock/MockCanvasAdapter.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```
git add src/infrastructure/mock/MockCanvasAdapter.ts tests/infrastructure/mock/MockCanvasAdapter.test.ts
git commit -m "feat(mock): add MockCanvasAdapter with seedCanvas and getWritten helpers"
```

---

## Task 6: ObsidianCanvasAdapter (TDD)

**Files:**
- Create: `tests/infrastructure/obsidian/ObsidianCanvasAdapter.test.ts`
- Create: `src/infrastructure/obsidian/ObsidianCanvasAdapter.ts`

This adapter takes a `VaultPort` (not `App`) so it can be tested without Obsidian by passing a `MockBridge`.

- [ ] **Step 1: Write the failing tests**

Create `tests/infrastructure/obsidian/ObsidianCanvasAdapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ObsidianCanvasAdapter } from '@/infrastructure/obsidian/ObsidianCanvasAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

describe('ObsidianCanvasAdapter', () => {
  it('isCanvas returns true for .canvas extension', () => {
    const adapter = new ObsidianCanvasAdapter(new MockBridge())
    expect(adapter.isCanvas('boards/my-board.canvas')).toBe(true)
  })

  it('isCanvas returns false for other extensions', () => {
    const adapter = new ObsidianCanvasAdapter(new MockBridge())
    expect(adapter.isCanvas('specs/foo/idea.md')).toBe(false)
  })

  it('readCanvas parses JSON from VaultPort', async () => {
    const data = { nodes: [{ id: '1' }], edges: [] }
    const bridge = new MockBridge({ 'boards/my-board.canvas': JSON.stringify(data) })
    const adapter = new ObsidianCanvasAdapter(bridge)
    expect(await adapter.readCanvas('boards/my-board.canvas')).toEqual(data)
  })

  it('writeCanvas serialises JSON to VaultPort', async () => {
    const bridge = new MockBridge()
    const adapter = new ObsidianCanvasAdapter(bridge)
    const data = { nodes: [], edges: [{ id: 'e1' }] }
    await adapter.writeCanvas('boards/my-board.canvas', data)
    const written = await bridge.readFile('boards/my-board.canvas')
    expect(JSON.parse(written)).toEqual(data)
  })

  it('round-trips canvas data through write then read', async () => {
    const bridge = new MockBridge()
    const adapter = new ObsidianCanvasAdapter(bridge)
    const data = { nodes: [{ id: 'n1', type: 'text', text: 'hello' }], edges: [] }
    await adapter.writeCanvas('boards/test.canvas', data)
    expect(await adapter.readCanvas('boards/test.canvas')).toEqual(data)
  })
})
```

- [ ] **Step 2: Run to verify the tests fail**

```
npx vitest run tests/infrastructure/obsidian/ObsidianCanvasAdapter.test.ts
```

Expected: fail with `Cannot find module '@/infrastructure/obsidian/ObsidianCanvasAdapter'`.

- [ ] **Step 3: Create `src/infrastructure/obsidian/ObsidianCanvasAdapter.ts`**

```ts
import type { CanvasPort, JsonCanvasData, VaultPort } from '@/domain/ports'

export class ObsidianCanvasAdapter implements CanvasPort {
  constructor(private readonly vault: VaultPort) {}

  isCanvas(path: string): boolean {
    return path.endsWith('.canvas')
  }

  async readCanvas(path: string): Promise<JsonCanvasData> {
    const raw = await this.vault.readFile(path)
    return JSON.parse(raw) as JsonCanvasData
  }

  async writeCanvas(path: string, data: JsonCanvasData): Promise<void> {
    await this.vault.writeFile(path, JSON.stringify(data, null, 2))
  }
}
```

- [ ] **Step 4: Run to verify the tests pass**

```
npx vitest run tests/infrastructure/obsidian/ObsidianCanvasAdapter.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```
git add src/infrastructure/obsidian/ObsidianCanvasAdapter.ts tests/infrastructure/obsidian/ObsidianCanvasAdapter.test.ts
git commit -m "feat(obsidian): add ObsidianCanvasAdapter delegating to VaultPort"
```

---

## Task 7: ObsidianMetadataCacheAdapter

**Files:**
- Create: `src/infrastructure/obsidian/ObsidianMetadataCacheAdapter.ts`

No unit tests — `src/infrastructure/obsidian/**` is excluded from coverage scope (CLAUDE.md). The adapter is verified at typecheck time and in smoke tests.

- [ ] **Step 1: Create `src/infrastructure/obsidian/ObsidianMetadataCacheAdapter.ts`**

```ts
import { TFile, type App } from 'obsidian'
import type { MetadataCachePort, FileMetadataSnapshot, Unsubscriber } from '@/domain/ports'

export class ObsidianMetadataCacheAdapter implements MetadataCachePort {
  constructor(private readonly app: App) {}

  getFileMetadata(path: string): FileMetadataSnapshot | null {
    const abstractFile = this.app.vault.getAbstractFileByPath(path)
    if (!(abstractFile instanceof TFile)) return null
    const cache = this.app.metadataCache.getFileCache(abstractFile)
    if (!cache) return null
    return {
      path,
      tags: (cache.tags ?? []).map((t) => t.tag),
      frontmatter: (cache.frontmatter ?? {}) as Record<string, unknown>,
      links: (cache.links ?? []).map((l) => l.link),
      embeds: (cache.embeds ?? []).map((e) => e.link),
    }
  }

  getBacklinks(path: string): string[] {
    const resolved = this.app.metadataCache.resolvedLinks
    const result: string[] = []
    for (const [source, targets] of Object.entries(resolved)) {
      if (path in targets) result.push(source)
    }
    return result
  }

  getResolvedLinks(sourcePath: string): Record<string, number> {
    return this.app.metadataCache.resolvedLinks[sourcePath] ?? {}
  }

  getAllTags(): Record<string, number> {
    return this.app.metadataCache.getTags()
  }

  onMetadataChanged(handler: (path: string) => void): Unsubscriber {
    const ref = this.app.metadataCache.on('changed', (file) => {
      handler(file.path)
    })
    return () => {
      this.app.metadataCache.offref(ref)
    }
  }
}
```

- [ ] **Step 2: Type-check**

```
npm run typecheck
```

Expected: no errors from the new file. If you see `Property 'offref' does not exist`, check that `obsidian` package is up to date — `offref` is available on all `Events` subclasses.

- [ ] **Step 3: Commit**

```
git add src/infrastructure/obsidian/ObsidianMetadataCacheAdapter.ts
git commit -m "feat(obsidian): add ObsidianMetadataCacheAdapter wrapping app.metadataCache"
```

---

## Task 8: ObsidianBridge — WorkspacePort extensions

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianBridge.ts`

No unit tests — excluded from coverage scope. Verified at typecheck.

- [ ] **Step 1: Add new imports to `src/infrastructure/obsidian/ObsidianBridge.ts`**

The existing import from `@/domain/ports` already imports `WorkspacePort`. Extend it to include the new types:

```ts
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
  LoggerPort,
  ActiveFileSnapshot,
  Unsubscriber,
} from '@/domain/ports'
```

- [ ] **Step 2: Add the two new methods after the existing `openFile` method**

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
  return () => {
    this.app.workspace.offref(ref)
  }
}
```

- [ ] **Step 3: Type-check**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add src/infrastructure/obsidian/ObsidianBridge.ts
git commit -m "feat(obsidian): implement WorkspacePort active-file methods on ObsidianBridge"
```

---

## Task 9: InjectionKey symbols and composables

**Files:**
- Modify: `src/infrastructure/bridge/ports.ts`
- Create: `src/ui/composables/useMetadataCachePort.ts`
- Create: `src/ui/composables/useCanvasPort.ts`

- [ ] **Step 1: Add two new symbols to `src/infrastructure/bridge/ports.ts`**

Current file content (replace entirely):

```ts
import type { InjectionKey } from 'vue'
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
  LoggerPort,
  MetadataCachePort,
  CanvasPort,
} from '@/domain/ports'

export const SETTINGS_PORT: InjectionKey<SettingsPort> = Symbol('SettingsPort')
export const VAULT_PORT: InjectionKey<VaultPort> = Symbol('VaultPort')
export const WORKSPACE_PORT: InjectionKey<WorkspacePort> = Symbol('WorkspacePort')
export const NOTIFICATION_PORT: InjectionKey<NotificationPort> = Symbol('NotificationPort')
export const LOGGER_PORT: InjectionKey<LoggerPort> = Symbol('LoggerPort')
export const METADATA_CACHE_PORT: InjectionKey<MetadataCachePort> = Symbol('MetadataCachePort')
export const CANVAS_PORT: InjectionKey<CanvasPort> = Symbol('CanvasPort')
```

- [ ] **Step 2: Create `src/ui/composables/useMetadataCachePort.ts`**

```ts
import { inject } from 'vue'
import type { MetadataCachePort } from '@/domain/ports'
import { METADATA_CACHE_PORT } from '@/infrastructure/bridge/ports'

export function useMetadataCachePort(): MetadataCachePort {
  const port = inject(METADATA_CACHE_PORT)
  if (!port) {
    throw new Error(
      'MetadataCachePort was not provided. Call app.provide(METADATA_CACHE_PORT, port) before mounting the app.',
    )
  }
  return port
}
```

- [ ] **Step 3: Create `src/ui/composables/useCanvasPort.ts`**

```ts
import { inject } from 'vue'
import type { CanvasPort } from '@/domain/ports'
import { CANVAS_PORT } from '@/infrastructure/bridge/ports'

export function useCanvasPort(): CanvasPort {
  const port = inject(CANVAS_PORT)
  if (!port) {
    throw new Error(
      'CanvasPort was not provided. Call app.provide(CANVAS_PORT, port) before mounting the app.',
    )
  }
  return port
}
```

- [ ] **Step 4: Type-check**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
git add src/infrastructure/bridge/ports.ts src/ui/composables/useMetadataCachePort.ts src/ui/composables/useCanvasPort.ts
git commit -m "feat(ports): add METADATA_CACHE_PORT and CANVAS_PORT symbols and composables"
```

---

## Task 10: Update fake-ports factory

**Files:**
- Modify: `tests/__fakes__/fake-ports.ts`

- [ ] **Step 1: Replace `tests/__fakes__/fake-ports.ts`**

```ts
import { vi } from 'vitest'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'
import { MockCanvasAdapter } from '@/infrastructure/mock/MockCanvasAdapter'
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
  LoggerPort,
  TranslationPort,
} from '@/domain/ports'
import { createEventBus } from '@/domain/shared/event-bus'
import type { EventBus } from '@/domain/shared/event-bus'

/**
 * Standard test seam: all four narrow ports backed by a single MockBridge
 * instance, plus a fresh EventBus and a vi.fn() spy LoggerPort.
 *
 * `bridge` is exposed so tests can inspect recorded notices and opened-file paths.
 * `bus` is exposed so tests can subscribe to events before calling module init.
 * `logger` spies can be asserted on: `ports.logger.warn`, `ports.logger.error`, etc.
 * `metadataCache` and `canvas` are exposed for tests that need those ports.
 */
export interface FakePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly logger: LoggerPort
  readonly bus: EventBus
  readonly t: TranslationPort
  readonly bridge: MockBridge
  readonly metadataCache: MockMetadataCacheAdapter
  readonly canvas: MockCanvasAdapter
}

export function fakeModulePorts(): FakePorts {
  const bridge = new MockBridge()
  const metadataCache = new MockMetadataCacheAdapter()
  const canvas = new MockCanvasAdapter()
  return {
    settings: bridge,
    vault: bridge,
    workspace: bridge,
    notifications: bridge,
    logger: {
      debug: vi.fn(),
      info:  vi.fn(),
      warn:  vi.fn(),
      error: vi.fn(),
    },
    bus: createEventBus(),
    t: { t: vi.fn((key: string) => key) },
    bridge,
    metadataCache,
    canvas,
  }
}
```

- [ ] **Step 2: Run the full test suite to verify nothing broke**

```
npm run test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```
git add tests/__fakes__/fake-ports.ts
git commit -m "feat(fakes): add metadataCache and canvas to fakeModulePorts factory"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run the full verify gate**

```
npm run verify
```

Expected: typecheck, lint, format check, tests, and coverage thresholds all green.

- [ ] **Step 2: If coverage thresholds fail**

The new mock adapters are in `src/infrastructure/mock/` which is included in coverage. The new Obsidian adapters are in `src/infrastructure/obsidian/` which is excluded. If thresholds fail, check which files are under-covered:

```
npm run test:coverage
```

Open `coverage/index.html` and look for red lines in `src/infrastructure/mock/`. Add targeted tests to the relevant test file to cover any uncovered branches.

- [ ] **Step 3: If lint fails on `ObsidianBridge.ts` `messageEl` deprecation warning**

This is a pre-existing warning unrelated to this work. Do not fix it here — it is a separate concern.

- [ ] **Step 4: Push the branch and open a PR targeting `develop`**

```
git push -u origin <your-branch-name>
gh pr create --title "feat(ports): W13-D1 narrow ports — MetadataCachePort, CanvasPort, WorkspacePort extensions" --base develop --body "Closes #182"
```
