/**
 * T-CCS-031, T-CCS-034 — Unit tests for the file-menu and active-leaf-change
 * handler logic wired in main.ts.
 *
 * Because the full Plugin lifecycle requires the Obsidian runtime, these tests
 * exercise the handler callbacks as pure functions, decoupled from the plugin
 * class. The Pinia store is the real `useChatStore` running in an isolated
 * pinia instance to keep assertions honest.
 *
 * Satisfies REQ-CCS-009 (dedup), REQ-CCS-005/006 (active file auto-slot).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { TFile, TFolder } from 'obsidian'
import { useChatStore } from '@/ui/stores/chatStore'

// ── helpers extracted from main.ts handler logic ─────────────────────────────

/**
 * Mirrors the onClick callback inside the 'file-menu' handler registered in
 * main.ts. Takes the store directly so we can test without the full plugin.
 */
function handleAddToContext(
  store: ReturnType<typeof useChatStore>,
  file: { path: string; name: string },
): void {
  store.addContextFile({ path: file.path, label: file.name, isAuto: false })
}

/**
 * Mirrors the 'active-leaf-change' handler callback in main.ts.
 */
function handleActiveLeafChange(
  store: ReturnType<typeof useChatStore>,
  activeFile: { path: string; name: string } | null,
): void {
  if (activeFile) {
    store.setActiveFile({ path: activeFile.path, label: activeFile.name, isAuto: true })
  } else {
    store.setActiveFile(null)
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('T-CCS-031: file-menu "Add to chat context" handler', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adds a file to contextFiles with isAuto=false', () => {
    const store = useChatStore()
    handleAddToContext(store, { path: 'specs/my-feature/requirements.md', name: 'requirements.md' })

    expect(store.contextFiles).toHaveLength(1)
    expect(store.contextFiles[0]).toEqual({
      path: 'specs/my-feature/requirements.md',
      label: 'requirements.md',
      isAuto: false,
    })
  })

  it('does not duplicate when the same file is added twice (REQ-CCS-009)', () => {
    const store = useChatStore()
    const file = { path: 'notes/foo.md', name: 'foo.md' }
    handleAddToContext(store, file)
    handleAddToContext(store, file)

    expect(store.contextFiles).toHaveLength(1)
  })

  it('adds multiple distinct files in order', () => {
    const store = useChatStore()
    handleAddToContext(store, { path: 'a.md', name: 'a.md' })
    handleAddToContext(store, { path: 'b.md', name: 'b.md' })

    expect(store.contextFiles).toHaveLength(2)
    expect(store.contextFiles[0].path).toBe('a.md')
    expect(store.contextFiles[1].path).toBe('b.md')
  })

  it('does not mark the file as auto-context (isAuto must be false)', () => {
    const store = useChatStore()
    handleAddToContext(store, { path: 'notes/bar.md', name: 'bar.md' })

    expect(store.contextFiles[0].isAuto).toBe(false)
  })

  describe('TFile / TFolder guard (Codex P2, PR #350)', () => {
    /**
     * Mirrors the production guard wired in `main.ts`'s file-menu handler:
     * the `file-menu` event fires for both files and folders, and the
     * production code now skips registration when the entry isn't a TFile
     * so a folder path never ends up as an unreadable context entry.
     */
    function registerIfFile(
      store: ReturnType<typeof useChatStore>,
      entry: unknown,
    ): boolean {
      if (!(entry instanceof TFile)) return false
      handleAddToContext(store, { path: entry.path, name: entry.name })
      return true
    }

    it('adds the entry to context when invoked on a TFile', () => {
      const store = useChatStore()
      const file = new TFile()
      file.path = 'notes/a.md'
      file.name = 'a.md'
      const added = registerIfFile(store, file)

      expect(added).toBe(true)
      expect(store.contextFiles).toHaveLength(1)
      expect(store.contextFiles[0]).toMatchObject({ path: 'notes/a.md', isAuto: false })
    })

    it('does NOT add a folder to context (TFolder rejected)', () => {
      const store = useChatStore()
      const folder = new TFolder()
      folder.path = 'notes'
      folder.name = 'notes'
      const added = registerIfFile(store, folder)

      expect(added).toBe(false)
      expect(store.contextFiles).toEqual([])
    })
  })
})

describe('T-CCS-034: active-leaf-change handler', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('sets the auto context slot when a file is active (REQ-CCS-005)', () => {
    const store = useChatStore()
    handleActiveLeafChange(store, { path: 'journal/today.md', name: 'today.md' })

    const auto = store.contextFiles.find((f) => f.isAuto)
    expect(auto).toBeDefined()
    expect(auto?.path).toBe('journal/today.md')
    expect(auto?.label).toBe('today.md')
  })

  it('places the auto entry at index 0 ahead of manual entries (REQ-CCS-006)', () => {
    const store = useChatStore()
    // Add a manual entry first
    store.addContextFile({ path: 'manual.md', label: 'manual.md', isAuto: false })
    handleActiveLeafChange(store, { path: 'auto.md', name: 'auto.md' })

    expect(store.contextFiles[0].isAuto).toBe(true)
    expect(store.contextFiles[0].path).toBe('auto.md')
    expect(store.contextFiles[1].path).toBe('manual.md')
  })

  it('clears the auto slot when activeFile is null (REQ-CCS-006)', () => {
    const store = useChatStore()
    handleActiveLeafChange(store, { path: 'some.md', name: 'some.md' })
    expect(store.contextFiles.some((f) => f.isAuto)).toBe(true)

    handleActiveLeafChange(store, null)
    expect(store.contextFiles.some((f) => f.isAuto)).toBe(false)
  })

  it('replaces a previous auto entry when the active file changes', () => {
    const store = useChatStore()
    handleActiveLeafChange(store, { path: 'first.md', name: 'first.md' })
    handleActiveLeafChange(store, { path: 'second.md', name: 'second.md' })

    const autos = store.contextFiles.filter((f) => f.isAuto)
    expect(autos).toHaveLength(1)
    expect(autos[0].path).toBe('second.md')
  })

  it('does not affect manual context files when active file changes', () => {
    const store = useChatStore()
    store.addContextFile({ path: 'manual.md', label: 'manual.md', isAuto: false })
    handleActiveLeafChange(store, { path: 'active.md', name: 'active.md' })
    handleActiveLeafChange(store, { path: 'active2.md', name: 'active2.md' })

    const manuals = store.contextFiles.filter((f) => !f.isAuto)
    expect(manuals).toHaveLength(1)
    expect(manuals[0].path).toBe('manual.md')
  })
})
