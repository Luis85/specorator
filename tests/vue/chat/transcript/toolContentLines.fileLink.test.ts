import { render } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/fileLink', () => ({
  resolveOpenableVaultPath: vi.fn(),
}));

import type { App } from 'obsidian';

import ToolContentLines from '@/features/chat/ui/vue/transcript/blocks/ToolContentLines.vue';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import { APP_KEY, CALLBACKS_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import { resolveOpenableVaultPath } from '@/utils/fileLink';

/**
 * Restores `renderFileSearchExpanded`'s `decorateVaultFileLink` treatment for
 * Glob/Grep/LS result lines: each non-header line resolves the raw line text
 * against the injected `App` via the shared `resolveOpenableVaultPath`
 * helper (not reimplemented — mocked here to isolate the component's wiring
 * from path-resolution mechanics, which are covered by
 * `tests/unit/utils/fileLink.test.ts`).
 */
const resolveMock = vi.mocked(resolveOpenableVaultPath);
const mockApp = {} as App;

function makeCallbacks(overrides: Partial<TranscriptCallbacks> = {}): TranscriptCallbacks {
  return {
    subscribe: vi.fn(),
    onRewind: vi.fn(),
    onFork: vi.fn(),
    isRewindEligible: vi.fn(() => false),
    openProviderSettings: vi.fn(),
    onRetryLastTurn: null,
    canRetryLastTurn: vi.fn(() => false),
    getMessageActions: vi.fn(() => []),
    copyText: vi.fn(),
    openFile: vi.fn(),
    resolveImageSrc: vi.fn(() => ''),
    showFullImage: vi.fn(),
    getProviderId: vi.fn(() => 'claude'),
    getWorkOrderPath: vi.fn(() => null),
    getCapabilities: vi.fn(() => ({
      providerId: 'claude',
      supportsPersistentRuntime: true,
      supportsNativeHistory: true,
      supportsPlanMode: true,
      supportsRewind: true,
      supportsFork: true,
      supportsProviderCommands: true,
      supportsImageAttachments: true,
      supportsInstructionMode: true,
      supportsMcpTools: true,
      reasoningControl: 'effort' as const,
    })),
    ...overrides,
  };
}

beforeEach(() => {
  resolveMock.mockReset();
});

describe('ToolContentLines file-search result-line links', () => {
  it('Glob: a resolvable path line carries the delegation contract (class + data-href), no direct openFile', () => {
    resolveMock.mockImplementation((_app, rawPath) => (rawPath === 'notes/found.md' ? 'notes/found.md' : null));
    const callbacks = makeCallbacks();

    const { container } = render(ToolContentLines, {
      props: { name: 'Glob', input: { pattern: '*.md' }, result: 'Found 1 file:\nnotes/found.md' },
      global: {
        provide: {
          [APP_KEY as symbol]: mockApp,
          [CALLBACKS_KEY as symbol]: callbacks,
        },
      },
    });

    const lines = container.querySelectorAll('.specorator-tool-line');
    expect(lines).toHaveLength(2);

    // Header line ("Found 1 file:") never resolves, even though hoverable
    // rows do — the header guard prevents the resolver from ever running.
    const headerLine = lines[0] as HTMLElement;
    expect(headerLine.classList.contains('hoverable')).toBe(false);
    expect(headerLine.classList.contains('specorator-file-link')).toBe(false);
    expect(headerLine.hasAttribute('role')).toBe(false);
    expect(headerLine.hasAttribute('data-href')).toBe(false);

    const fileLine = lines[1] as HTMLElement;
    expect(fileLine.classList.contains('hoverable')).toBe(true);
    expect(fileLine.classList.contains('specorator-file-link')).toBe(true);
    expect(fileLine.getAttribute('role')).toBe('link');
    expect(fileLine.getAttribute('data-href')).toBe('notes/found.md');

    // No direct click handler: the resolved element relies on the delegated
    // `registerFileLinkHandler` (bound on the scroll host by `mountTranscript`)
    // to open it exactly once — a direct handler here would double-open.
    fileLine.click();
    expect(callbacks.openFile).not.toHaveBeenCalled();
  });

  it('Grep: a non-vault result line stays plain text (no link, no data-href)', () => {
    resolveMock.mockReturnValue(null);
    const callbacks = makeCallbacks();

    const { container } = render(ToolContentLines, {
      props: { name: 'Grep', input: { pattern: 'TODO' }, result: '/tmp/outside.md:3:TODO here' },
      global: {
        provide: {
          [APP_KEY as symbol]: mockApp,
          [CALLBACKS_KEY as symbol]: callbacks,
        },
      },
    });

    const line = container.querySelector('.specorator-tool-line') as HTMLElement;
    expect(line.classList.contains('hoverable')).toBe(true);
    expect(line.classList.contains('specorator-file-link')).toBe(false);
    expect(line.hasAttribute('role')).toBe(false);
    expect(line.hasAttribute('data-href')).toBe(false);

    line.click();
    expect(callbacks.openFile).not.toHaveBeenCalled();
  });

  it('LS: resolves lines when app is injected, stamping data-href for the delegated handler', () => {
    resolveMock.mockImplementation((_app, rawPath) => rawPath);
    const callbacks = makeCallbacks();

    const { container } = render(ToolContentLines, {
      props: { name: 'LS', input: { path: 'notes' }, result: 'notes/a.md\nnotes/b.md' },
      global: {
        provide: {
          [APP_KEY as symbol]: mockApp,
          [CALLBACKS_KEY as symbol]: callbacks,
        },
      },
    });

    const lines = Array.from(container.querySelectorAll('.specorator-tool-line')) as HTMLElement[];
    expect(lines).toHaveLength(2);
    lines.forEach((line, i) => {
      expect(line.classList.contains('specorator-file-link')).toBe(true);
      expect(line.getAttribute('data-href')).toBe(i === 0 ? 'notes/a.md' : 'notes/b.md');
    });

    // Delegation contract only: no direct openFile on click.
    lines[1].click();
    expect(callbacks.openFile).not.toHaveBeenCalled();
  });

  it('does not decorate lines when no App is injected (resolver never called)', () => {
    resolveMock.mockImplementation((_app, rawPath) => rawPath);

    const { container } = render(ToolContentLines, {
      props: { name: 'Glob', input: {}, result: 'notes/a.md' },
    });

    expect(resolveMock).not.toHaveBeenCalled();
    const line = container.querySelector('.specorator-tool-line') as HTMLElement;
    expect(line.classList.contains('specorator-file-link')).toBe(false);
  });
});
