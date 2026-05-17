# Non-goals

Things Specorator deliberately does not support, with the rationale. New surfaces should consult this file before designing for cases that don't matter to our actual users.

Anything not on this list is in scope by default. To add an entry, open a PR; consensus over chat is fine.

---

## CJK / IME composition on the standalone-web Safari demo

**Surface:** `npm run build:web` → GitHub Pages standalone demo, accessed via Safari.

**Behaviour we will NOT defend:**

- Safari's documented IME ordering bug, where `compositionend` may fire **before** the keydown that confirms an IME candidate. In that ordering, both `event.isComposing` and any tracked `isImeComposing` ref are `false` on the keydown that the user intends as an IME-commit, so the Ctrl/Cmd+Enter handler in `ChatInput.vue` / `InlinePlanApprovalCard.vue` will treat that Enter as a real send.

**Why not:**

- **Primary surface is Obsidian (Electron, Chromium).** The Electron baseline reports `event.isComposing` correctly throughout composition per the W3C UI Events spec. CJK input works without any IME-specific code.
- **Standalone web is a demo, not a product.** It exists for the public preview at GitHub Pages and for `npm run dev` development. It is not a production input surface for CJK users.
- **The fix would either reintroduce deprecated `KeyboardEvent.keyCode === 229`** (requiring an `eslint-disable @typescript-eslint/no-deprecated` we explicitly rejected as a workaround — see PR [#395](https://github.com/Luis85/specorator/pull/395)) **or require browser-sniffing** (`navigator.userAgent` detection) with its own ongoing maintenance cost. Neither pays for itself for a demo surface.
- **Production-grade editors** (CodeMirror, ProseMirror, Lexical, monaco-editor) all defend this case because they ARE production input surfaces and CJK users depend on them. We do not have that responsibility for a workflow plugin's demo.

**What we DO defend (in scope):**

- `event.isComposing` for spec-compliant browsers (Chromium, Firefox, Obsidian's Electron baseline). The guard in `ChatInput.vue` and `InlinePlanApprovalCard.vue` is the single line `if (event.isComposing) return;`.

**If this changes:**

- If a CJK user reports the bug on the Obsidian plugin proper (not the standalone-web demo), reopen this decision — Obsidian's Electron baseline should not exhibit Safari's ordering. If it does, that's a real bug.
- If the standalone-web demo gets promoted to a product, this entry should be revisited and the IME guard hardened (browser-sniff or restored `keyCode === 229` with documented rationale).

**Related:** PR [#395](https://github.com/Luis85/specorator/pull/395) Codex review threads [#3254304551](https://github.com/Luis85/specorator/pull/395#discussion_r3254304551), [#3254304552](https://github.com/Luis85/specorator/pull/395#discussion_r3254304552) (won't-fix per maintainer decision 2026-05-17).
