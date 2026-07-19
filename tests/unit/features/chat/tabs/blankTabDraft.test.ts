import {
  applyUserAttachedContext,
  blankTabHasAttachedContext,
  blankTabHasPendingDraft,
  snapshotUserAttachedContext,
} from '@/features/chat/tabs/blankTabDraft';
import type { TabData } from '@/features/chat/tabs/types';

function makeTab(opts: {
  files?: string[];
  folders?: string[];
  currentNote?: string | null;
  hasImages?: boolean;
  inputValue?: string;
  attachFile?: jest.Mock;
  attachFolder?: jest.Mock;
} = {}): TabData {
  const {
    files = [],
    folders = [],
    currentNote = null,
    hasImages = false,
    inputValue = '',
    attachFile = jest.fn(),
    attachFolder = jest.fn(),
  } = opts;
  return {
    ui: {
      fileContextManager: {
        getCurrentNotePath: jest.fn(() => currentNote),
        getAttachedFiles: jest.fn(() => new Set(files)),
        getAttachedFolders: jest.fn(() => new Set(folders)),
        attachFileAsPill: attachFile,
        attachFolderAsPill: attachFolder,
      },
      imageContextManager: { hasImages: jest.fn(() => hasImages) },
    },
    dom: { inputEl: { value: inputValue } },
  } as unknown as TabData;
}

describe('blankTabHasAttachedContext', () => {
  it('is FALSE when the only attached file is the passive current note (survives the welcome reset)', () => {
    const tab = makeTab({ files: ['Daily.md'], currentNote: 'Daily.md' });
    expect(blankTabHasAttachedContext(tab)).toBe(false);
    expect(blankTabHasPendingDraft(tab)).toBe(false);
  });

  it('is TRUE for a user-attached file that is not the current note', () => {
    const tab = makeTab({ files: ['Daily.md', 'notes/other.md'], currentNote: 'Daily.md' });
    expect(blankTabHasAttachedContext(tab)).toBe(true);
  });

  it('is TRUE for an attached folder even when a current note is present', () => {
    const tab = makeTab({ files: ['Daily.md'], folders: ['docs'], currentNote: 'Daily.md' });
    expect(blankTabHasAttachedContext(tab)).toBe(true);
  });

  it('is TRUE when images are attached', () => {
    const tab = makeTab({ hasImages: true });
    expect(blankTabHasAttachedContext(tab)).toBe(true);
  });

  it('is FALSE for a truly empty blank tab', () => {
    expect(blankTabHasAttachedContext(makeTab())).toBe(false);
  });

  it('treats attached files with no known current note as user context (partial mock without getCurrentNotePath)', () => {
    const tab = {
      ui: {
        fileContextManager: {
          getAttachedFiles: () => new Set(['notes/a.md']),
          getAttachedFolders: () => new Set<string>(),
        },
      },
    } as unknown as TabData;
    expect(blankTabHasAttachedContext(tab)).toBe(true);
  });
});

describe('snapshotUserAttachedContext', () => {
  it('captures user files + folders and excludes the current note', () => {
    const tab = makeTab({ files: ['Daily.md', 'notes/a.md'], folders: ['docs'], currentNote: 'Daily.md' });
    expect(snapshotUserAttachedContext(tab)).toEqual({ files: ['notes/a.md'], folders: ['docs'] });
  });

  it('returns empty for a null/undefined tab or a tab without a file context manager', () => {
    expect(snapshotUserAttachedContext(null)).toEqual({ files: [], folders: [] });
    expect(snapshotUserAttachedContext(undefined)).toEqual({ files: [], folders: [] });
    expect(snapshotUserAttachedContext({ ui: {} } as unknown as TabData)).toEqual({ files: [], folders: [] });
  });
});

describe('applyUserAttachedContext', () => {
  it('re-attaches every snapshotted file and folder as a pill', () => {
    const attachFile = jest.fn();
    const attachFolder = jest.fn();
    const tab = makeTab({ attachFile, attachFolder });
    applyUserAttachedContext(tab, { files: ['notes/a.md', 'notes/b.md'], folders: ['docs'] });
    expect(attachFile).toHaveBeenCalledWith('notes/a.md');
    expect(attachFile).toHaveBeenCalledWith('notes/b.md');
    expect(attachFolder).toHaveBeenCalledWith('docs');
  });

  it('is a no-op for an empty snapshot or a tab without a file context manager', () => {
    const attachFile = jest.fn();
    const tab = makeTab({ attachFile });
    applyUserAttachedContext(tab, { files: [], folders: [] });
    expect(attachFile).not.toHaveBeenCalled();
    expect(() => applyUserAttachedContext(null, { files: ['x'], folders: [] })).not.toThrow();
  });
});
