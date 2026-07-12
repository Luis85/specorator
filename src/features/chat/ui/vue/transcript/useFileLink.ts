import { inject } from 'vue';

import { resolveOpenableVaultPath } from '../../../../../utils/fileLink';
import { APP_KEY } from './transcriptKeys';

/**
 * Shared vault-file-link RESOLUTION: resolves a raw tool-input path against the
 * injected `App` via `resolveOpenableVaultPath` so the caller can stamp the
 * `.specorator-file-link` + `data-href` contract. Consolidates the identical
 * inject-guard/resolve pair that `ToolCall.vue` (`.specorator-tool-summary`),
 * `ToolContentLines.vue` (file-search result lines), and `WriteEditView.vue`
 * (`.specorator-write-edit-summary`) each reproduced from the legacy
 * `decorateToolSummaryPath`/`decorateVaultFileLink` (`rendering/ToolCallRenderer.ts`).
 *
 * Opening is NOT done here: the resolved `data-href` element is opened once by
 * the DELEGATED `registerFileLinkHandler` bound on the transcript scroll host
 * (`mountTranscript`), matching the legacy tool-link delegation. A direct click
 * handler here would double-open (direct + delegated).
 *
 * `resolve` returns `null` (without calling the resolver) when no `App` is
 * injected or `rawPath` is falsy — callers that need extra gating (e.g.
 * `ToolCall.vue`'s LS `"."` guard, which must never call the resolver) check
 * that before calling `resolve`.
 */
export interface UseFileLinkResult {
  resolve: (rawPath: string | null | undefined) => string | null;
}

export function useFileLink(): UseFileLinkResult {
  const app = inject(APP_KEY, undefined);

  function resolve(rawPath: string | null | undefined): string | null {
    if (!app || !rawPath) return null;
    return resolveOpenableVaultPath(app, rawPath);
  }

  return { resolve };
}
