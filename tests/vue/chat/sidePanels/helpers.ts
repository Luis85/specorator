import { vi } from 'vitest';

import type { ConversationMeta } from '@/core/types';

// Shared fixture builders for the side-panels specs. `vi.mock` calls CANNOT
// live here (Vitest hoists them per test file), so each spec keeps its own
// obsidian/i18n mock lines; these factories keep the callback SHAPES from
// drifting between files instead.

/** Full `ChatShellCallbacks` side-panel surface as spies (header components
 *  only ever read their own members, so one shared shape serves all specs). */
export function shellCallbacks(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    onOpenHistory: vi.fn(),
    onOpenConversationInNewTab: vi.fn(),
    onRenameConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onRegenerateConversationTitle: vi.fn(),
    onConversationContextMenu: vi.fn(),
    onGitCommit: vi.fn(),
    onOpenWorkOrderItem: vi.fn(),
    onCloseWorkOrderTab: vi.fn(),
    ...overrides,
  };
}

/** `TabChromeCallbacks` double for the tab-chrome island specs. */
export function chromeCallbacks(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    onCopyBashOutput: vi.fn(),
    onClearBashOutputs: vi.fn(),
    resolveNavHost: () => null,
    ...overrides,
  };
}

/** Minimal `ConversationMeta` row for history-dropdown fixtures. */
export function conversationMeta(id: string, extra: Record<string, unknown> = {}): ConversationMeta {
  return {
    id, providerId: 'claude', title: `Title ${id}`,
    createdAt: 1, updatedAt: 1, lastResponseAt: 1, messageCount: 2, preview: '',
    ...extra,
  } as unknown as ConversationMeta;
}
