# WP-4 — Markdown port as only path + bypass during stream + safeHref tighten

**Branch:** `claude/asv3-wp04-markdown-hardening` (cut from `origin/develop`)
**Lane:** Markdown (independent — no inter-WP dependency)
**Estimated size:** medium (~400–500 LOC net; mostly deletions in `MarkdownBlock.vue` + a new streaming-text sub-component + targeted test additions)

## Goal (one sentence)

Make `MarkdownRenderPort` the only renderer for completed assistant turns, bypass the port entirely while a turn is still streaming (raw `<pre>` text, no parser), and tighten `safeHref` so the rendered link surface cannot smuggle script, data, file, blob, or relative `javascript:` URIs.

## Problem statement

`src/ui/components/agent/MarkdownBlock.vue` (475 LOC, flagged by the `max-lines` ESLint warning at 351 originally — it has grown since the audit recorded that number) carries two implementations: the production path that delegates to Obsidian's `MarkdownRenderer` via `MARKDOWN_RENDER_PORT` (lines 348–400), and a hand-rolled VNode parser for paragraphs / code fences / lists / blockquotes / inline bold/italic/code/links (lines 39–336) used as a fallback in tests, Storybook, and the GitHub Pages standalone build. Both are exercised in production: `MessageList.vue:309` renders completed assistant turns through `MarkdownBlock`, and `MessageList.vue:359` re-uses the same component to render the in-flight `streamingText` bubble. The streaming bubble re-mounts the renderer on every token delta — the `watch(() => props.text, …)` at line 383 calls `rerenderNative()` per change, which awaits a fresh `MarkdownRenderer.render` per Obsidian Component. The audit ascribes a 351-LOC max-lines warning to this file plus user-visible flicker during streaming (the per-token native re-render disposes + re-creates the DOM under the cursor).

The `safeHref` allowlist at line 181 accepts `http(s):`, `mailto:`, `/`-prefixed paths, and `#` anchors. It rejects `javascript:` and `data:` correctly, but tolerates upper-case `JAVASCRIPT:` (the regex IS `i`-flagged — so that case is fine), tolerates whitespace-prefixed schemes like `\tjavascript:alert(1)` (the `.trim()` neuters that — also fine), but does NOT explicitly reject `file:`, `blob:`, `vbscript:`, `chrome-extension:`, or `obsidian:` URIs. Those fall through the relative-path branch only if they start with `/` (they don't). They fall through as "unsafe" → `null` href, which is the correct outcome. The audit asks for a hardening pass that makes this an explicit allowlist with a unit-tested rejection table covering the dangerous schemes by name plus the protocol-relative form `//evil.example.com` (which currently passes the `/` branch and emits a usable href — a real gap).

## Scope — IN

**Make the port the only path for completed turns.** Delete the hand-rolled VNode parser branch from `MarkdownBlock.vue` and require `MARKDOWN_RENDER_PORT` to be provided. Standalone (GitHub Pages, dev) and tests get a `LocalStorageMarkdownRenderPort` / `MockMarkdownRenderPort` implementation that calls into a tiny pure parser (extracted from the current VNode code into a small shared module — keeps the parser test coverage, kills the dual-branch component).

**Bypass the port during streaming.** Introduce `StreamingMarkdownBlock.vue` (or rename: a `streaming` prop on `MarkdownBlock` — see Approach below) that renders `<pre>` `textContent` only while the turn is still streaming. Switch to the port-rendered path exactly once on stream complete. `MessageList.vue:359` swaps to the streaming variant; line 309 keeps the port-only variant.

**Tighten `safeHref`.** Replace the current "allow http(s)/mailto + root-relative + fragment" approach with an explicit deny pass: reject `javascript:`, `data:`, `file:`, `blob:`, `vbscript:`, `about:`, `chrome:`, `chrome-extension:`, `obsidian:`; then accept the existing allowlist; default-reject everything else. Reject protocol-relative `//host` (treat as unsafe — emit no href). Add a co-located test in `tests/ui/components/agent/MarkdownBlock.po.ts`'s sibling test file with a rejection table covering each scheme + protocol-relative form.

## Scope — OUT

- The `MarkdownRenderPort` interface shape (stable, owned by ADR-008 ports surface).
- Mermaid / math / wikilinks behaviour — those are properties of Obsidian's renderer, not this file.
- The streaming-text live-region / aria-busy plumbing — that's WP-7 (now merged) and the streaming bubble already carries `aria-busy="true"` + `aria-live="off"`.
- `MessageList.vue` empty state, scroll-rAF, /help popover — that's WP-8 (merged).
- The native Obsidian adapter for the port (`src/infrastructure/obsidian/ObsidianMarkdownRenderPort.ts` or wherever it lives) — out of scope; only the consumer changes.

## Approach

1. **Extract the hand-rolled parser** from `MarkdownBlock.vue` into a new `src/ui/components/agent/internal/markdown-parser.ts` module exporting `parseBlocks`, `parseInline`, `renderBlock`, `renderInline`, and `safeHref` (currently private to the SFC). This is a pure module — same tests apply, fewer LOC in the SFC.
2. **Create `MockMarkdownRenderPort` and `LocalStorageMarkdownRenderPort`** under `src/infrastructure/mock/` and `src/infrastructure/localstorage/` respectively. Both adapters call the extracted parser, write VNodes into the passed container via `createApp(h => …).mount(container)` (or a hand-rolled `document.createElement` traversal — choose the simpler one), return a disposer that detaches.
3. **Wire the adapters** in `MockBridge.ts` and `LocalStorageBridge.ts` so the port is always present. Update `src/ui/main.ts` to provide the mock port. Delete the `inject(MARKDOWN_RENDER_PORT, undefined)` fallback at line 348.
4. **Streaming bypass.** Add a `streaming` boolean prop to `MarkdownBlock.vue`. When `true`, render `<pre class="sp-markdown__streaming">{{ text }}</pre>` with `whitespace: pre-wrap` + zero markdown parsing — pure text. When `false`, hit the port. Toggle from `streaming=true` to `streaming=false` exactly once at stream complete: `MessageList.vue:359` reads a `streamingComplete` flag that flips when `streamingStore.streamingText.length === 0 && lastTurnFinished`.
5. **Tighten `safeHref`.** Move it from the SFC to the extracted parser module. Implement as explicit deny → allow → default-reject. Add `tests/ui/components/agent/internal/markdown-parser.test.ts` with the rejection table.
6. **Drop the `max-lines` warning.** Post-refactor `MarkdownBlock.vue` is < 200 LOC (template + script delegate to the port; parser lives elsewhere).
7. **Run the full pre-PR gate every iteration.**

## Deliverables

**New files:**

- `src/ui/components/agent/internal/markdown-parser.ts` — extracted pure parser + `safeHref`.
- `src/infrastructure/mock/MockMarkdownRenderPort.ts` — adapter that uses the parser.
- `src/infrastructure/localstorage/LocalStorageMarkdownRenderPort.ts` — same adapter (delegates to mock).
- `tests/ui/components/agent/internal/markdown-parser.test.ts` — parser tests including the `safeHref` rejection table.
- `tests/infrastructure/mock/MockMarkdownRenderPort.test.ts`.

**Modified files:**

- `src/ui/components/agent/MarkdownBlock.vue` — port-only renderer + `streaming` prop branch.
- `src/ui/components/agent/MessageList.vue:359` — pass `:streaming="true"` for the in-flight bubble; pass `:streaming="false"` for completed turns.
- `src/infrastructure/mock/MockBridge.ts` — provide `MockMarkdownRenderPort`.
- `src/infrastructure/localstorage/LocalStorageBridge.ts` — provide `LocalStorageMarkdownRenderPort`.
- `src/ui/main.ts` — wire the port for standalone.
- `tests/ui/components/agent/MarkdownBlock.test.ts` — drop tests for the deleted fallback branch; add streaming-vs-port toggle tests.
- `tests/ui/components/agent/MarkdownBlock.po.ts` — adapt selectors (still `data-testid` only).

**Deleted (no back-compat shims, per CLAUDE.md):**

- The 39–336 hand-rolled parser body in `MarkdownBlock.vue` (moved, not deleted in spirit — but the SFC no longer carries it).
- Any test that asserts on the now-removed fallback `<div class="sp-markdown">…children…</div>` shape.

## Definition of done

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors; `max-lines` warning on `MarkdownBlock.vue` is **gone** (file < 200 LOC).
- [ ] `npm run test` passes; new parser-module test ≥ 95% statements/branches.
- [ ] `npm run build` + `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` thresholds maintained or improved.
- [ ] **Streaming bypass closed**: assert in `MessageList.test.ts` that when `streamingText.length > 0` the rendered DOM is a `<pre>` (no markdown parsing). After stream complete, the DOM is the port-rendered tree.
- [ ] **`safeHref` table closed**: parser-module test asserts rejection of `javascript:`, `data:`, `file:`, `blob:`, `vbscript:`, `about:`, `chrome:`, `chrome-extension:`, `obsidian:`, and protocol-relative `//host`. Asserts acceptance of `https:`, `http:`, `mailto:`, `/root/relative`, `#fragment`.
- [ ] **Port-only invariant**: the `inject(MARKDOWN_RENDER_PORT, undefined)` fallback at line 348 is gone; the component throws (or asserts at mount) if the port is missing.
- [ ] PR opened against `develop`, title `refactor(asv3): markdown port as only path + streaming bypass + safeHref tighten (WP-4)`, body cites the audit's MarkdownBlock LOC warning and the safeHref hardening rationale.

## Risks / known unknowns

The streaming bypass assumes the streaming bubble doesn't depend on Obsidian wikilink resolution, math rendering, or mermaid during the in-flight phase. If the audit reveals a downstream consumer of mid-stream rich markdown (unlikely — text-deltas arrive as raw markdown source), this assumption holds. The `<pre>` bypass kills the cursor-during-render flicker entirely — accept the trade-off that mid-stream markdown looks like plain monospace until complete. The parser extraction risks subtle regressions in test fixtures that asserted on the SFC-internal class names (`.sp-markdown__p`, `.sp-markdown__pre`); search `tests/` for class-name assertions before deleting — though ADR-009 already forbids CSS-class selectors, so this should be a no-op.

## RALPH iteration template

```
loop:
  1. Read brief.md + loop-state.md.
  2. Pick the next failing check (audit → typecheck → lint → test → build → docs → DoD).
  3. Implement the smallest change that moves one check red→green.
     STAY IN SCOPE — no port interface changes, no Obsidian adapter touches.
  4. Run from inside .worktrees/asv3-wp04:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck && npm run lint && npm run test \
         && npm run build && npm run build:web && npm run docs:api
  5. Update loop-state.md.
  6. If all gates green AND all DoD met → commit, push, open PR via gh.
     Else → goto 1.
  Hard cap: 10 RALPH iterations.
```

## Conventions

- **Worktree:** `.worktrees/asv3-wp04` (already created, branch `claude/asv3-wp04-markdown-hardening`).
- **Commits:** conventional, squash on merge. Prefix `refactor(asv3):`.
- **PR target:** `develop`. Ready for review (not draft).
- **Do not touch:** the `MarkdownRenderPort` interface, the Obsidian adapter, `MessageList`'s scroll / a11y wiring, `ChatInput`.
- **Never** push to `develop`. Never force-push.
