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
  images?: Array<{ id: string }>;
  inputValue?: string;
  attachFile?: jest.Mock;
  attachFolder?: jest.Mock;
  setImages?: jest.Mock;
} = {}): TabData {
  const {
    files = [],
    folders = [],
    currentNote = null,
    images = [],
    inputValue = '',
    attachFile = jest.fn(),
    attachFolder = jest.fn(),
    setImages = jest.fn(),
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
      imageContextManager: {
        hasImages: jest.fn(() => images.length > 0),
        getAttachedImages: jest.fn(() => [...images]),
        setImages,
      },
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
    const tab = makeTab({ images: [{ id: 'i1' }] });
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
  it('captures user files + folders + images and excludes the current note', () => {
    const tab = makeTab({
      files: ['Daily.md', 'notes/a.md'],
      folders: ['docs'],
      images: [{ id: 'img-1' }],
      currentNote: 'Daily.md',
    });
    expect(snapshotUserAttachedContext(tab)).toEqual({
      files: ['notes/a.md'],
      folders: ['docs'],
      images: [{ id: 'img-1' }],
    });
  });

  it('returns empty slices for a null/undefined tab or a tab without context managers', () => {
    const empty = { files: [], folders: [], images: [] };
    expect(snapshotUserAttachedContext(null)).toEqual(empty);
    expect(snapshotUserAttachedContext(undefined)).toEqual(empty);
    expect(snapshotUserAttachedContext({ ui: {} } as unknown as TabData)).toEqual(empty);
  });
});

describe('applyUserAttachedContext', () => {
  it('re-attaches every snapshotted file and folder as a pill', () => {
    const attachFile = jest.fn();
    const attachFolder = jest.fn();
    const tab = makeTab({ attachFile, attachFolder });
    applyUserAttachedContext(tab, { files: ['notes/a.md', 'notes/b.md'], folders: ['docs'], images: [] });
    expect(attachFile).toHaveBeenCalledWith('notes/a.md');
    expect(attachFile).toHaveBeenCalledWith('notes/b.md');
    expect(attachFolder).toHaveBeenCalledWith('docs');
  });

  it('appends snapshotted images to whatever the target already holds', () => {
    const setImages = jest.fn();
    const tab = makeTab({ images: [{ id: 'existing' }], setImages });
    applyUserAttachedContext(tab, { files: [], folders: [], images: [{ id: 'carried' } as never] });
    expect(setImages).toHaveBeenCalledWith([{ id: 'existing' }, { id: 'carried' }]);
  });

  it('is a no-op for an empty snapshot or a tab without a file context manager', () => {
    const attachFile = jest.fn();
    const setImages = jest.fn();
    const tab = makeTab({ attachFile, setImages });
    applyUserAttachedContext(tab, { files: [], folders: [], images: [] });
    expect(attachFile).not.toHaveBeenCalled();
    expect(setImages).not.toHaveBeenCalled();
    expect(() => applyUserAttachedContext(null, { files: ['x'], folders: [], images: [] })).not.toThrow();
  });
});
