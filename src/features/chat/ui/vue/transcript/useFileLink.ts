import { inject } from 'vue';

import { resolveOpenableVaultPath } from '../../../../../utils/fileLink';
import { APP_KEY, CALLBACKS_KEY } from './transcriptKeys';

/**
 * Shared vault-file-link decoration: resolves a raw tool-input path against
 * the injected `App` via `resolveOpenableVaultPath` and opens it through the
 * injected `callbacks.openFile`. Consolidates the identical
 * inject-guard/resolve/open triplet that `ToolCall.vue`
 * (`.specorator-tool-summary`), `ToolContentLines.vue` (file-search result
 * lines), and `WriteEditView.vue` (`.specorator-write-edit-summary`) each
 * reproduced from the legacy `decorateToolSummaryPath`/`decorateVaultFileLink`
 * (`rendering/ToolCallRenderer.ts`).
 *
 * `resolve` returns `null` (without calling the resolver) when no `App` is
 * injected or `rawPath` is falsy — callers that need extra gating (e.g.
 * `ToolCall.vue`'s LS `"."` guard, which must never call the resolver) check
 * that before calling `resolve`.
 */
export interface UseFileLinkResult {
  resolve: (rawPath: string | null | undefined) => string | null;
  open: (linkPath: string | null) => void;
}

export function useFileLink(): UseFileLinkResult {
  const app = inject(APP_KEY, undefined);
  const callbacks = inject(CALLBACKS_KEY, undefined);

  function resolve(rawPath: string | null | undefined): string | null {
    if (!app || !rawPath) return null;
    return resolveOpenableVaultPath(app, rawPath);
  }

  function open(linkPath: string | null): void {
    if (linkPath) {
      callbacks?.openFile(linkPath);
    }
  }

  return { resolve, open };
}
