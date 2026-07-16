import { describe, expect, it, vi } from 'vitest';

import { TabComposerProjection } from '@/features/chat/tabs/tabComposer';
import type { TabData } from '@/features/chat/tabs/types';
import type { ComposerSnapshot } from '@/features/chat/ui/vue/composer/composerCallbacks';
import type SpecoratorPlugin from '@/main';

// Toolbar/wrapper slices are derived from these helpers; stub them so the test
// exercises only the chips + edited-files projection with no provider wiring.
vi.mock('@/features/chat/tabs/tabShared', () => ({
  getTabPermissionMode: vi.fn(() => 'normal'),
  getTabCapabilities: vi.fn(() => ({ supportsPlanMode: true })),
  getTabChatUIConfig: vi.fn(() => ({ getModelOptions: () => [] })),
  getProviderMcpManager: vi.fn(() => null),
}));
vi.mock('@/features/chat/tabs/tabUi', () => ({
  getComposerToolbarSettings: vi.fn(() => ({ model: '', thinkingBudget: '', effortLevel: '', serviceTier: '', permissionMode: 'normal' })),
}));
vi.mock('@/features/chat/tabs/tabModelPolicy', () => ({ getBlankTabModelOptions: vi.fn(() => []) }));

function makePlugin(): SpecoratorPlugin {
  return { app: {}, settings: {}, getActiveEnvironmentVariables: () => '' } as unknown as SpecoratorPlugin;
}

function makeChipsTab(): TabData {
  // The current note is also present in the attached-files set (the imperative
  // manager attaches it), so `files` must de-dupe it out.
  const files = new Set(['notes/current.md', 'notes/other.md']);
  const folders = new Set(['docs/design']);
  return {
    state: {
      isStreaming: false,
      editedFiles: [
        { path: 'src/app/a.ts', changeKind: 'created' },
        { path: 'top.md', changeKind: 'edited' },
      ],
    },
    dom: { inputEl: { value: '' } },
    ui: {
      instructionModeManager: { isActive: () => false },
      bangBashModeManager: { isActive: () => false },
      fileContextManager: {
        getCurrentNotePath: () => 'notes/current.md',
        getAttachedFiles: () => files,
        getAttachedFolders: () => folders,
      },
      imageContextManager: {
        getAttachedImages: () => [
          { id: 'img-1', name: 'shot.png', mediaType: 'image/png', data: 'AAAA', size: 2048, source: 'paste' },
        ],
      },
    },
  } as unknown as TabData;
}

function project(): ComposerSnapshot {
  let snap: ComposerSnapshot | null = null;
  new TabComposerProjection(makeChipsTab(), makePlugin()).subscribe((s) => (snap = s));
  return snap!;
}

describe('TabComposerProjection chips + edited files', () => {
  it('projects the current note as its own field, de-duped out of files', () => {
    const { chips } = project();
    expect(chips.currentNote).toEqual({ path: 'notes/current.md', label: 'current.md', kind: 'current' });
    // The current note must NOT also appear in `files`.
    expect(chips.files).toEqual([{ path: 'notes/other.md', label: 'other.md', kind: 'file' }]);
    expect(chips.files.some((f) => f.path === 'notes/current.md')).toBe(false);
  });

  it('projects folders separately with a trailing-slash label', () => {
    const { chips } = project();
    expect(chips.folders).toEqual([{ path: 'docs/design', label: 'design/' }]);
  });

  it('projects image chips with resolved src and size label, keyed by id', () => {
    const { chips } = project();
    expect(chips.images).toEqual([
      { id: 'img-1', name: 'shot.png', sizeLabel: '2.0 KB', src: 'data:image/png;base64,AAAA' },
    ]);
  });

  it('projects edited files with basename + parent dir (empty at root)', () => {
    const { editedFiles } = project();
    expect(editedFiles).toEqual([
      { path: 'src/app/a.ts', changeKind: 'created', name: 'a.ts', dir: 'src/app' },
      { path: 'top.md', changeKind: 'edited', name: 'top.md', dir: '' },
    ]);
  });
});
