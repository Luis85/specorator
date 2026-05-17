# WP-4 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Worktree context** — All implementation entries below describe work performed on `claude/asv3-wp04-markdown-hardening` inside `.worktrees/asv3-wp04/`. The brief was scaffolded from the main worktree on `claude/improve-sidepanel-chat-8pgcT` (PR #395 era).

## Iterations

### Iteration 1 — port-only path + bypass + safeHref tighten (RALPH implementer)

Implemented in one pass:

- **New pure parser** at `src/ui/components/agent/internal/markdown-parser.ts`. Extracts the
  paragraph / code-fence / list / blockquote / inline bold/italic/code/link rendering
  that used to live inside `MarkdownBlock.vue`, plus the `safeHref` allowlist.
- **`safeHref` hardened** — now an explicit deny pass (`javascript:`, `data:`, `file:`,
  `blob:`, `vbscript:`, `about:`, `chrome:`, `chrome-extension:`, `obsidian:`) plus a
  protocol-relative `//host` rejection, followed by the existing allowlist
  (`https:`, `http:`, `mailto:`, `/root/relative`, `#fragment`), default-reject
  for anything else. Whitespace-tolerant via `.trim()`; case-insensitive via the
  scheme regex. Tested in `tests/ui/components/agent/internal/markdown-parser.test.ts`
  with a rejection table covering every scheme in the brief.
- **New adapters** — `MockMarkdownRenderPort` (`src/infrastructure/mock/`) and
  `LocalStorageMarkdownRenderPort` (`src/infrastructure/localstorage/`, delegates
  to the mock). Both call the pure parser via `renderMarkdownInto`, write DOM
  nodes (no `innerHTML`), and return a disposer that detaches the wrapper.
  Unit-tested in `tests/infrastructure/mock/MockMarkdownRenderPort.test.ts`.
- **`MarkdownBlock.vue` simplified** to ~205 LOC (down from 458). The component
  is now port-only: it throws at mount if `MARKDOWN_RENDER_PORT` is missing
  (port-only invariant closed). The hand-rolled VNode parser branch is gone.
  Monotonic render sequence (`latestSeq`) guards against out-of-order async
  port renders disposing the wrong tree.
- **Streaming bypass** — new `streaming?: boolean` prop. When `true`, the
  template renders a `<pre class="sp-markdown sp-markdown--streaming">{{ text }}</pre>`
  with `white-space: pre-wrap` and zero markdown parsing — pure text via Vue
  interpolation, no per-token reparse / re-mount flicker. `MessageList.vue:363`
  now passes `:streaming="true"` for the in-flight bubble; completed turns
  keep the port-rendered tree.
- **`src/ui/main.ts`** — wires `MockMarkdownRenderPort` (dev) /
  `LocalStorageMarkdownRenderPort` (PROD standalone) via
  `app.provide(MARKDOWN_RENDER_PORT, …)` so the port is always present in
  the browser UI build.
- **Test updates** — `MarkdownBlock.test.ts` drops fallback-branch tests, adds
  streaming-prop coverage. `MessageList.test.ts` /
  `MessageList.compactBoundary.test.ts` / `InlinePlanApprovalCard.test.ts`
  updated to provide the new port via `provide`.

### Iteration 2 — full pre-PR gate (this session)

Ran the AGENTS.md §3 gate end-to-end from `.worktrees/asv3-wp04/`:

- `npm audit --audit-level=high --omit=dev` — **clean** (0 vulnerabilities).
- `npm run typecheck` — **clean**.
- `npm run lint` — **0 errors**, 23 pre-existing warnings on other files; the
  brief's "`max-lines` warning on `MarkdownBlock.vue` is gone" criterion is
  satisfied (205 LOC, below the 350 threshold).
- `npm run test` — **1915 passed (151 files)**.
- `npm run build` — succeeds; regenerates `styles.css` (scoped Vue styles,
  expected to change, included in commit).
- `npm run build:web` — succeeds.
- `npm run docs:api` — succeeds (1 pre-existing TypeDoc warning unrelated
  to WP-4).

All DoD criteria met. Branch ready for PR → `develop`.

## Carry-out items

_None yet. Append `[carry-out] WP-NN: …` lines for issues found outside this WP's scope so the owning WP can pick them up later._
