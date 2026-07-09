// Obsidian's HTMLElement prototype extensions (empty/addClass/removeClass/...)
// — the same polyfill module the Jest lane uses; it self-installs on import.
// Without it, any code path touching contentEl.empty()/addClass() throws in
// the Vitest lane. Imported via `@test` so the alias is exercised every run.
import '@test/setup/obsidianDom';

import { cleanup } from '@testing-library/vue';
import { afterEach, vi } from 'vitest';

// tests/__mocks__/obsidian.ts calls jest.fn() at module scope. vi.fn is
// API-compatible for everything the mock uses (fn/mockResolvedValue/
// mockReturnValue/mockImplementation), so alias the global before any test
// file imports 'obsidian' through the vitest resolve.alias.
(globalThis as Record<string, unknown>).jest = vi;

// @testing-library/vue auto-registers its per-test cleanup ONLY when a global
// afterEach exists at import time (it does not under vitest without
// test.globals). Register it explicitly, or every render() leaks its container
// into document.body and the second test in a file hits
// 'Found multiple elements'.
afterEach(() => cleanup());
