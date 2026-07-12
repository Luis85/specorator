import { render } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MessageContextCard from '@/features/chat/ui/vue/transcript/cards/MessageContextCard.vue';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';

/**
 * Parity twin of `messageContextCard.characterization.test.ts`: reproduces
 * the same DOM contract via `MessageContextCard.vue`, sourcing `openFile`
 * from the injected callbacks seam instead of an `onOpenFile` prop.
 */
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
  vi.clearAllMocks();
});

describe('MessageContextCard', () => {
  it('renders nothing when files and folders are both empty', () => {
    const { container } = render(MessageContextCard, { props: { files: [], folders: [] } });
    expect(container.querySelector('.specorator-context-card')).toBeNull();
  });

  it('renders header count, file rows, folder rows (trailing slash), and wires openFile on file click', async () => {
    const callbacks = makeCallbacks();
    const { container } = render(MessageContextCard, {
      props: { files: ['notes/design.md'], folders: ['assets/images'] },
      global: { provide: { [CALLBACKS_KEY as symbol]: callbacks } },
    });

    const card = container.querySelector('.specorator-context-card')!;
    expect(card.querySelector('.specorator-context-card-header-label')?.textContent).toBe(
      'Attached context (2)',
    );

    const fileRow = card.querySelector('.specorator-context-card-row--file') as HTMLElement;
    expect(fileRow.classList.contains('specorator-context-card-row--clickable')).toBe(true);
    const fileName = fileRow.querySelector('.specorator-context-card-row-name')!;
    expect(fileName.textContent).toBe('design.md');
    expect(fileName.getAttribute('title')).toBe('notes/design.md');

    fileRow.click();
    expect(callbacks.openFile).toHaveBeenCalledWith('notes/design.md');

    const folderRow = card.querySelector('.specorator-context-card-row--folder') as HTMLElement;
    const folderName = folderRow.querySelector('.specorator-context-card-row-name')!;
    expect(folderName.textContent).toBe('images/');
    expect(folderName.getAttribute('title')).toBe('assets/images');
  });

  it('does not mark file rows clickable when callbacks are not provided', () => {
    const { container } = render(MessageContextCard, { props: { files: ['a.md'], folders: [] } });
    const fileRow = container.querySelector('.specorator-context-card-row--file') as HTMLElement;
    expect(fileRow.classList.contains('specorator-context-card-row--clickable')).toBe(false);
  });
});
