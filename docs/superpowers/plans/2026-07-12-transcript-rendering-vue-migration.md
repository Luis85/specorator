# Transcript Rendering Vue Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the imperative chat transcript — `MessageRenderer`, every `rendering/*` block renderer, and the DOM-patching streaming write-side — with a single Vue 3 + Pinia island that renders both stored and live turns through one reactive path.

**Architecture:** The ADR 0004/0005 island seam pushed one level deeper, into the per-tab `messagesEl`. `TabManager`, tab lifecycle, provider runtimes, and `StreamController`'s chunk-routing + block-transition projection logic stay intact; only the stream **output** changes from raw DOM mutation to reactive-data mutation. The in-flight assistant message becomes an ordinary `ChatMessage` in a Pinia store whose `contentBlocks`/`toolCalls` are appended/updated as data during the turn; Vue renders it through the same components as any stored message — there is no separate live path. A single Vue-hostile surface, async Obsidian markdown, is quarantined behind `MarkdownHost.vue`, which owns one element and treats its children as opaque.

**Tech Stack:** Vue 3 (SFCs, `<script setup>`), Pinia (setup stores, `shallowRef` projections), Obsidian `MarkdownRenderer`, Vitest (`tests/vue/` lane), the shipped `.specorator-vue` style baseline + `--sp-*` tokens.

**Hard constraint — the DOM contract:** Vue takes over the transcript DOM, but four still-imperative consumers read it by class/attribute and are out of scope here: `NavigationController`/`NavigationSidebar` (scan `.specorator-message-user` + `offsetTop`), the three selection controllers, `ChatDropController` (overlay), and `StreamController` auto-scroll (scroll container + pin-to-bottom). **The Vue transcript must reproduce the existing class names and data attributes exactly.** A DOM-contract characterization test (Task 20) locks this; every component task asserts parity against the legacy renderer's output.

**Execution note — build additively, cut over once.** Tasks 1–17 are *additive and unwired*: new files under `src/features/chat/ui/vue/transcript/`, green tests, zero deletions, the imperative transcript still live. The hard cut (delete `MessageRenderer` + `rendering/*` + DOM-patch coordinator paths, mount `TranscriptRoot`, remove `ChatState` DOM-pointer fields) happens in Tasks 18–19 and lands with everything already proven. This keeps every intermediate commit shippable and the blast radius contained to two tasks.

---

## File Structure

New tree under `src/features/chat/ui/vue/transcript/` (mirrors the shell island's `ui/vue/` layout):

```
ui/vue/transcript/
  transcriptPinia.ts              — per-leaf createPinia() factory (mirror globalPinia.ts)
  transcriptKeys.ts               — inject keys: APP_KEY, COMPONENT_KEY, PLUGIN_KEY, CALLBACKS_KEY, SCROLL_HOST_KEY
  transcriptCallbacks.ts          — TranscriptCallbacks (Vue→engine seam) + TranscriptSnapshot + TranscriptSubscribe
  useTranscriptEventRouting.ts    — subscribe→store composable (mirror useChatShellEventRouting.ts)
  stores/transcriptStore.ts       — useTranscriptStore: messages + activeStream reactive read-model
  MarkdownHost.vue                — async Obsidian markdown seam (owns el, opaque children, generation token)
  markdownHostRender.ts           — the render+post-process pipeline extracted for unit test
  collapsible.ts                  — useCollapsible composable (click/Enter/Space contract)
  TranscriptRoot.vue              — mounts store+routing; exposes scroll container; owns windowing state
  WelcomeBanner.vue               — greeting + hydration-error banner
  LoadEarlierControl.vue          — mounts previous window chunk above (scroll-anchored)
  MessageList.vue                 — windowed v-for (RENDER_WINDOW_SIZE = 80)
  MessageBubble.vue               — .specorator-message shell; user vs assistant branch
  BlockList.vue                   — <component :is> dispatch over contentBlocks + leftover/legacy fallback
  blocks/
    TextBlock.vue                 — MarkdownHost + copy button + work-order segment split
    ThinkingBlock.vue             — MarkdownHost, collapsible, live "Thinking Ns…" timer
    ToolCall.vue                  — header (icon/name/summary/status) + collapsible content
    WriteEditView.vue             — file write/edit + DiffView
    DiffView.vue                  — unified-diff hunks + ± stats
    TodoListView.vue              — todo items + status icons
    WebSearchView.vue             — web-search results
    SubagentBlock.vue             — sync + async lifecycle; nested tool views; collapsible sections
    ContextCompactedMarker.vue    — "Conversation compacted" boundary
    RuntimeErrorCard.vue          — classified error + open-settings / retry / login hint
    AskQuestionResult.vue         — read-only answered ask-user state
  cards/
    WorkOrderProgressCard.vue
    WorkOrderNeedsInputCard.vue
    WorkOrderNeedsApprovalCard.vue
    WorkOrderHandoffCard.vue
    MessageContextCard.vue        — @mention file/folder rows
    MessageImages.vue             — attachment thumbnails + full-size modal
    MessageActionBar.vue          — copy / rewind (Obsidian Menu) / fork; capability-gated
  StreamingIndicator.vue          — reactive isThinking / isWriting / elapsed timer
  inline/
    InlineApproval.vue            — Deny / Allow-once / Always-allow
    InlineAskUserQuestion.vue     — tabbed multi-question, multi-select, custom input, keyboard nav
    InlineExitPlanMode.vue        — plan preview + permissions; approve-new/current/feedback
    InlinePlanApproval.vue        — Implement / revise / Cancel
```

Tests mirror this under `tests/vue/chat/transcript/`. Characterization tests that snapshot the *legacy* renderer output live beside them as `*.characterization.test.ts`.

Engine files rewritten in the streaming phase (Tasks 15–18), not recreated:
`controllers/StreamController.ts`, `controllers/TextRenderCoordinator.ts`, `controllers/ThinkingRenderCoordinator.ts`, `controllers/streamingIndicator.ts`, `state/ChatState.ts`, `state/types.ts`, plus the DOM-pointer readers in `controllers/InputController.ts`, `controllers/composerSendPhases.ts`, `tabs/tabRuntimeHost.ts`.

Deleted in the cut (Task 18): `rendering/MessageRenderer.ts`, `rendering/MessageSubagentRenderer.ts`, `rendering/MessageImageRenderer.ts`, `rendering/MessageActionBar.ts`, `rendering/assistantMessageContent.ts`, `rendering/ToolCallRenderer.ts`, `rendering/WriteEditRenderer.ts`, `rendering/DiffRenderer.ts`, `rendering/TodoListRenderer.ts`, `rendering/SubagentRenderer.ts`, `rendering/ThinkingBlockRenderer.ts`, `rendering/Inline*.ts`, `rendering/WorkOrder*Card.ts`, `rendering/WorkOrderProtocolDisplay.ts`, `rendering/MessageContextCard.ts`, `rendering/askUserQuestion*.ts`, `rendering/askQuestionTabRenderer.ts`, `rendering/inlineChoiceCard.ts`, `rendering/webSearch*.ts`, `rendering/applyPatchExpandedHelpers.ts`, `rendering/toolLabel.ts`, `rendering/toolLinesExpanded.ts`, `rendering/contentFallback.ts`, `rendering/collapsible.ts`, `rendering/codeBlockFormatter.ts` (moved into `markdownHostRender.ts`), `rendering/planContentPreview.ts`, `rendering/windowedRenderSetup.ts`, `rendering/scrollToBottom.ts`, `rendering/visibleContentHelpers.ts`, `rendering/subagentLifecycleResolution.ts` (moved to a shared util), `controllers/streamRenderLoop.ts`, `controllers/toolCallAppend.ts`'s DOM-patch export, and the DOM-side of `controllers/toolCallIndex.ts` stays (data-only). The exact deletion set is finalized in Task 18 by grepping for remaining importers.

---

## Shared conventions (every task)

- **Cross-window popout safety from the start:** element-type guards use `node.nodeType === 1` and `el.ownerDocument`, NEVER `instanceof HTMLElement` (the mountIcon / IconButton lesson — a popout leaf renders in a different `window`).
- **Store churn contract:** every setter replaces a whole value/array reference (`shallowRef`), never mutates in place, so a change fires the watch without deep-proxy overhead. Match `useChatShellStore`.
- **Styling:** components carry the `.specorator-vue` baseline class at the island root and style through `--sp-*` tokens, but **emit the legacy `.specorator-*` transcript classes** the DOM contract requires. Both can coexist on one element (`class="specorator-message specorator-message-assistant"`).
- **No `innerHTML`/`outerHTML`/`insertAdjacentHTML`** anywhere (lint-enforced). Markdown goes through `MarkdownHost` only.
- **Commit after every task.** Run `npm run typecheck:vue && npm run test:vue` (Vue lane) and, for engine-file tasks, `npm run typecheck && npm run test && npm run lint` before committing.

---

## Phase 0 — Foundation (additive, unwired)

### Task 1: Transcript Pinia factory + store

**Files:**
- Create: `src/features/chat/ui/vue/transcript/transcriptPinia.ts`
- Create: `src/features/chat/ui/vue/transcript/stores/transcriptStore.ts`
- Test: `tests/vue/chat/transcript/transcriptPinia.test.ts`, `tests/vue/chat/transcript/transcriptStore.test.ts`

- [ ] **Step 1: Write the failing Pinia-factory test**

```ts
// tests/vue/chat/transcript/transcriptPinia.test.ts
import { describe, expect, it } from 'vitest';
import { createTranscriptPinia } from '@/features/chat/ui/vue/transcript/transcriptPinia';

describe('createTranscriptPinia', () => {
  it('returns a fresh Pinia per call — per-leaf isolation, not a shared singleton', () => {
    // Each chat leaf owns its own ChatState/messages; a shared store would let
    // one transcript overwrite another's. Same reasoning as createChatShellPinia.
    expect(createTranscriptPinia()).not.toBe(createTranscriptPinia());
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (`npm run test:vue -- transcriptPinia`) — "Cannot find module".

- [ ] **Step 3: Implement the factory**

```ts
// src/features/chat/ui/vue/transcript/transcriptPinia.ts
import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// A FRESH Pinia per chat leaf — NOT a shared module singleton. Each SpecoratorView
// tab owns its own ChatState.messages; the plugin supports multiple open chat
// leaves. A shared `transcript` store would let one leaf's projected messages
// overwrite another's. Mirrors createChatShellPinia. GC'd with the app on unmount.
export function createTranscriptPinia(): Pinia {
  return createPinia();
}
```

- [ ] **Step 4: Write the failing store test**

```ts
// tests/vue/chat/transcript/transcriptStore.test.ts
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTranscriptPinia } from '@/features/chat/ui/vue/transcript/transcriptPinia';
import { useTranscriptStore } from '@/features/chat/ui/vue/transcript/stores/transcriptStore';
import type { ChatMessage } from '@/core/types';

function msg(id: string): ChatMessage {
  return { id, role: 'assistant', content: '', timestamp: 0 };
}

describe('useTranscriptStore', () => {
  beforeEach(() => setActivePinia(createTranscriptPinia()));

  it('setMessages replaces the whole array (new reference)', () => {
    const store = useTranscriptStore();
    const a = [msg('1')];
    store.setMessages(a);
    expect(store.messages).toBe(a);
    const b = [msg('1'), msg('2')];
    store.setMessages(b);
    expect(store.messages).toBe(b);
  });

  it('setActiveStream drives the in-flight turn projection', () => {
    const store = useTranscriptStore();
    store.setActiveStream({ messageId: '2', blockIndex: 1, isThinking: true, isWriting: false, elapsedSeconds: 3 });
    expect(store.activeStream?.messageId).toBe('2');
    expect(store.activeStream?.isThinking).toBe(true);
    store.setActiveStream(null);
    expect(store.activeStream).toBeNull();
  });
});
```

- [ ] **Step 5: Run it, expect FAIL**.

- [ ] **Step 6: Implement the store**

```ts
// src/features/chat/ui/vue/transcript/stores/transcriptStore.ts
import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import type { ChatMessage } from '../../../../../core/types';

/** The in-flight turn's reactive state. Null when no turn is streaming. */
export interface ActiveStreamState {
  /** id of the assistant ChatMessage currently being appended to. */
  messageId: string;
  /** index into that message's contentBlocks of the block being written. */
  blockIndex: number;
  isThinking: boolean;
  isWriting: boolean;
  elapsedSeconds: number;
}

/**
 * Reactive read-model over the active tab's ChatState. Truth + I/O stay in
 * ChatState; every setter replaces a whole value (shallowRef) so a change fires
 * the watch without deep-proxy overhead. Mirrors useChatShellStore's contract.
 */
export const useTranscriptStore = defineStore('transcript', () => {
  const messages = shallowRef<ChatMessage[]>([]);
  const activeStream = shallowRef<ActiveStreamState | null>(null);

  function setMessages(next: ChatMessage[]): void {
    messages.value = next;
  }
  function setActiveStream(next: ActiveStreamState | null): void {
    activeStream.value = next;
  }

  return { messages, activeStream, setMessages, setActiveStream };
});
```

- [ ] **Step 7: Run both tests, expect PASS**. Run `npm run typecheck:vue`.

- [ ] **Step 8: Commit** — `feat(chat): transcript Pinia factory + reactive store (unwired)`.

---

### Task 2: `MarkdownHost.vue` — the async-markdown seam

The single Vue-hostile surface. Owns one element, treats children as opaque, re-renders through Obsidian's async pipeline on text change, drops stale renders with a generation token. Reproduces `MessageRenderer.renderContent` exactly (math escaping, image-embed normalization, `formatCodeBlocks`, `processFileLinks`).

**Files:**
- Create: `src/features/chat/ui/vue/transcript/markdownHostRender.ts`
- Create: `src/features/chat/ui/vue/transcript/MarkdownHost.vue`
- Create: `src/features/chat/ui/vue/transcript/transcriptKeys.ts`
- Test: `tests/vue/chat/transcript/markdownHost.test.ts`

- [ ] **Step 1: Add inject keys**

```ts
// src/features/chat/ui/vue/transcript/transcriptKeys.ts
import type { App, Component } from 'obsidian';
import type { InjectionKey } from 'vue';
import type SpecoratorPlugin from '../../../../main';
import type { TranscriptCallbacks } from './transcriptCallbacks';

export const APP_KEY: InjectionKey<App> = Symbol('specorator.transcript.app');
export const COMPONENT_KEY: InjectionKey<Component> = Symbol('specorator.transcript.component');
export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator.transcript.plugin');
export const CALLBACKS_KEY: InjectionKey<TranscriptCallbacks> = Symbol('specorator.transcript.callbacks');
/** TranscriptRoot hands its scroll container up to the engine (auto-scroll seam). */
export const SCROLL_HOST_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.transcript.scrollHost');
```

> `transcriptCallbacks.ts` is created in Task 3; add a temporary
> `export interface TranscriptCallbacks {}` stub there now if the import fails,
> then flesh it out in Task 3.

- [ ] **Step 2: Extract the render pipeline (copy of `MessageRenderer.renderContent`) as a pure function + write its failing test**

```ts
// tests/vue/chat/transcript/markdownHost.test.ts
import { describe, expect, it, vi } from 'vitest';
import { renderMarkdownInto } from '@/features/chat/ui/vue/transcript/markdownHostRender';

// Obsidian MarkdownRenderer.render is mocked in the Vue lane's obsidian shim to
// append a <div class="rendered-md" data-src="..."> so we can assert it ran.
describe('renderMarkdownInto', () => {
  it('empties the element then renders markdown into it', async () => {
    const el = document.createElement('div');
    el.createDiv?.({ text: 'stale' }) ?? el.appendChild(document.createElement('span'));
    const app = {} as never;
    const component = {} as never;
    await renderMarkdownInto({ app, component, el, markdown: 'hello', mediaFolder: '' });
    expect(el.querySelector('.rendered-md')?.getAttribute('data-src')).toContain('hello');
  });
});
```

- [ ] **Step 3: Run it, expect FAIL**.

- [ ] **Step 4: Implement `renderMarkdownInto`** — lift the body of `MessageRenderer.renderContent` (lines 786–822 of the old file) verbatim, parameterized:

```ts
// src/features/chat/ui/vue/transcript/markdownHostRender.ts
import type { App, Component } from 'obsidian';
import { MarkdownRenderer } from 'obsidian';
import { processFileLinks } from '../../../../utils/fileLink';
import { replaceImageEmbedsWithHtml } from '../../../../utils/imageEmbed';
import { escapeMathDelimitersForStreaming } from '../../../../utils/markdownMath';
import { formatCodeBlocks } from './codeBlockFormatter'; // moved here in Task 18; for now import from '../../../rendering/codeBlockFormatter'

export interface RenderMarkdownArgs {
  app: App;
  component: Component;
  el: HTMLElement;
  markdown: string;
  mediaFolder: string;
  deferMath?: boolean;
}

/** Obsidian async markdown render + post-process. Mirror of the old
 *  MessageRenderer.renderContent — DO NOT change behavior. */
export async function renderMarkdownInto(args: RenderMarkdownArgs): Promise<void> {
  const { app, component, el, markdown, mediaFolder, deferMath } = args;
  el.empty();
  try {
    const md = deferMath ? escapeMathDelimitersForStreaming(markdown) : markdown;
    const processed = replaceImageEmbedsWithHtml(md, app, { mediaFolder });
    await MarkdownRenderer.render(app, processed, el, '', component);
    formatCodeBlocks(el);
    processFileLinks(app, el);
  } catch {
    el.createDiv({ cls: 'specorator-render-error', text: 'Failed to render message content.' });
  }
}
```

> Until Task 18 moves `codeBlockFormatter.ts`, import it from its current path
> `../../../rendering/codeBlockFormatter`. Fix the import in Task 18.

- [ ] **Step 5: Run it, expect PASS**.

- [ ] **Step 6: Write the failing SFC test** (generation token + opaque children)

```ts
// append to markdownHost.test.ts
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MarkdownHost from '@/features/chat/ui/vue/transcript/MarkdownHost.vue';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';

function mountHost(markdown: string) {
  return mount(MarkdownHost, {
    props: { markdown },
    global: { provide: {
      [APP_KEY as symbol]: {},
      [COMPONENT_KEY as symbol]: {},
      [PLUGIN_KEY as symbol]: { settings: { mediaFolder: '' } },
    } },
  });
}

it('re-renders on markdown prop change and drops the stale generation', async () => {
  const wrapper = mountHost('first');
  await nextTick(); await Promise.resolve();
  await wrapper.setProps({ markdown: 'second' });
  await nextTick(); await Promise.resolve(); await Promise.resolve();
  // Only the latest render survives — no duplicated/steale content.
  const rendered = wrapper.element.querySelectorAll('.rendered-md');
  expect(rendered.length).toBe(1);
  expect(rendered[0].getAttribute('data-src')).toContain('second');
});

it('never diffs inside the host — children are Vue-opaque', () => {
  const wrapper = mountHost('x');
  // The template has exactly one child element (the owned host div), no v-for.
  expect(wrapper.element.children.length).toBe(1);
});
```

- [ ] **Step 7: Run it, expect FAIL**.

- [ ] **Step 8: Implement `MarkdownHost.vue`**

```vue
<!-- src/features/chat/ui/vue/transcript/MarkdownHost.vue -->
<script setup lang="ts">
import { inject, onMounted, ref, watch } from 'vue';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from './transcriptKeys';
import { renderMarkdownInto } from './markdownHostRender';

const props = defineProps<{ markdown: string; deferMath?: boolean }>();

const app = inject(APP_KEY)!;
const component = inject(COMPONENT_KEY)!;
const plugin = inject(PLUGIN_KEY)!;

// The element Vue owns but never diffs into. nodeType guard (not instanceof
// HTMLElement) keeps popout leaves safe.
const hostEl = ref<HTMLElement | null>(null);
// Monotonic token: a newer render supersedes an in-flight one. Reproduces
// streamRenderLoop's identity-token discipline for async Obsidian renders.
let generation = 0;

async function render(): Promise<void> {
  const el = hostEl.value;
  if (!el || el.nodeType !== 1) return;
  const mine = ++generation;
  const pending = el.ownerDocument.createElement('div');
  await renderMarkdownInto({
    app, component, el: pending, markdown: props.markdown,
    mediaFolder: plugin.settings.mediaFolder ?? '', deferMath: props.deferMath,
  });
  if (mine !== generation) return; // a newer render landed; drop this one
  el.empty();
  while (pending.firstChild) el.appendChild(pending.firstChild);
}

onMounted(render);
watch(() => props.markdown, render);
</script>

<template>
  <div ref="hostEl" class="specorator-markdown-host" />
</template>
```

> Rendering into a detached `pending` element and swapping only after the
> generation check avoids a flash of empty content and guarantees the stale
> render never touches the live DOM.

- [ ] **Step 9: Run the tests, expect PASS**. `npm run typecheck:vue`.

- [ ] **Step 10: Commit** — `feat(chat): MarkdownHost async-markdown seam with generation token (unwired)`.

---

### Task 3: Callbacks seam + event-routing composable

The Vue→engine seam (thin delegators) and the subscribe→store composable. Unwired — nothing calls `subscribe` yet.

**Files:**
- Create: `src/features/chat/ui/vue/transcript/transcriptCallbacks.ts` (replace the Task-2 stub)
- Create: `src/features/chat/ui/vue/transcript/useTranscriptEventRouting.ts`
- Test: `tests/vue/chat/transcript/useTranscriptEventRouting.test.ts`

- [ ] **Step 1: Define the callbacks + snapshot contract**

```ts
// src/features/chat/ui/vue/transcript/transcriptCallbacks.ts
import type { ChatMessage, ImageAttachment } from '../../../../core/types';
import type { ChatRewindMode } from '../../../../core/runtime/types';
import type { ActiveStreamState } from './stores/transcriptStore';

/** One projected snapshot the view pushes on every ChatState.onMessagesChanged
 *  + streaming transition. */
export interface TranscriptSnapshot {
  messages: ChatMessage[];
  activeStream: ActiveStreamState | null;
}

export type TranscriptSubscribe = (onChange: (s: TranscriptSnapshot) => void) => () => void;

/** Vue → engine actions. Thin delegators to SpecoratorView / controllers. */
export interface TranscriptCallbacks {
  subscribe: TranscriptSubscribe;
  /** Rewind a user message (Claude/Codex). */
  onRewind: (messageId: string, mode?: ChatRewindMode) => Promise<void>;
  /** Fork from a user message. */
  onFork: (messageId: string) => Promise<void>;
  /** Whether rewind/fork are eligible for this message index (findRewindContext). */
  isRewindEligible: (messageId: string) => boolean;
  /** Open provider settings (runtime-error card, disabled-provider prompt). */
  openProviderSettings: (providerId: string) => void;
  /** Re-dispatch the user's last turn (runtime-error retry); null when unavailable. */
  onRetryLastTurn: (() => void) | null;
  /** Registered per-message actions (e.g. Create work order). */
  getMessageActions: (msg: ChatMessage) => Array<{ id: string; label: string; icon: string; run: () => void }>;
  /** Copy helper (writes to clipboard + transient "copied" feedback owned by caller). */
  copyText: (text: string) => void;
  /** Open a vault file (context-card @mention click / file links). */
  openFile: (path: string) => void;
  /** Resolve an image attachment's <img> src (vault file preferred over base64). */
  resolveImageSrc: (image: ImageAttachment) => string;
  /** Show an image in the full-size modal overlay. */
  showFullImage: (image: ImageAttachment) => void;
  /** Provider id of the active tab (capability gating, subagent adapter). */
  getProviderId: () => string;
  /** Work-order note path for this tab, or null (drives protocol card splitting). */
  getWorkOrderPath: () => string | null;
}
```

- [ ] **Step 2: Write the failing routing test**

```ts
// tests/vue/chat/transcript/useTranscriptEventRouting.test.ts
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createTranscriptPinia } from '@/features/chat/ui/vue/transcript/transcriptPinia';
import { useTranscriptStore } from '@/features/chat/ui/vue/transcript/stores/transcriptStore';
import { useTranscriptEventRouting } from '@/features/chat/ui/vue/transcript/useTranscriptEventRouting';
import type { TranscriptSnapshot } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';

describe('useTranscriptEventRouting', () => {
  beforeEach(() => setActivePinia(createTranscriptPinia()));

  it('fans snapshots into the store and disposes on unmount', () => {
    let push!: (s: TranscriptSnapshot) => void;
    const dispose = vi.fn();
    const subscribe = (cb: (s: TranscriptSnapshot) => void) => { push = cb; return dispose; };
    const store = useTranscriptStore();
    const Comp = defineComponent({ setup() { useTranscriptEventRouting(subscribe); return () => h('div'); } });
    const wrapper = mount(Comp);
    push({ messages: [{ id: '1', role: 'assistant', content: '', timestamp: 0 }], activeStream: null });
    expect(store.messages).toHaveLength(1);
    wrapper.unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run it, expect FAIL**.

- [ ] **Step 4: Implement the composable** (mirror `useChatShellEventRouting`)

```ts
// src/features/chat/ui/vue/transcript/useTranscriptEventRouting.ts
import { onMounted, onUnmounted } from 'vue';
import type { TranscriptSubscribe } from './transcriptCallbacks';
import { useTranscriptStore } from './stores/transcriptStore';

export function useTranscriptEventRouting(subscribe: TranscriptSubscribe): void {
  const store = useTranscriptStore();
  let dispose: (() => void) | null = null;
  onMounted(() => {
    dispose = subscribe((snapshot) => {
      store.setMessages(snapshot.messages);
      store.setActiveStream(snapshot.activeStream);
    });
  });
  onUnmounted(() => { dispose?.(); dispose = null; });
}
```

- [ ] **Step 5: Run it, expect PASS**. `npm run typecheck:vue`.

- [ ] **Step 6: Commit** — `feat(chat): transcript callbacks seam + event-routing composable (unwired)`.

---

## Phase 1 — Leaf block components (characterization-gated, unwired)

**The characterization pattern (every Phase 1/2/3 task):**
1. Write a `*.characterization.test.ts` that constructs the **legacy** renderer against a JSDOM element with representative input, and snapshots the exact class names / attributes / text / structure it produces. Run it — it passes against the current code (this is the contract).
2. Build the Vue component to emit the same DOM. Write a parity test asserting the mounted component's DOM matches the characterization snapshot's key assertions (same classes, attributes, nesting, interaction).
3. The legacy characterization test stays green until Task 18 deletes the renderer; then it is deleted alongside it (its parity twin remains).

Read the legacy source named in each task for the exact class-name set; the DOM-contract test in Task 20 is the backstop that nothing was missed.

### Task 4: `TextBlock.vue` + `ThinkingBlock.vue` + `ContextCompactedMarker.vue`

**Legacy sources to port:** `MessageRenderer.renderPlainAssistantTextBlock` / `renderUserTextBlock` / `renderAssistantTextBlock` (work-order segment split), `ThinkingBlockRenderer.ts` (`createThinkingBlock` / `finalizeThinkingBlock` / `renderStoredThinkingBlock`), and the `context_compacted` arm of `assistantMessageContent.renderContentBlock`.

**DOM contract (verbatim):**
- Text block: `<div class="specorator-text-block">` containing MarkdownHost output; assistant text blocks additionally get a copy button (Task 9's `MessageActionBar.addTextCopyButton` today — reproduce its `.specorator-text-copy-btn` structure here or delegate to a shared copy composable).
- Work-order execution prompt (user text matching the `You are executing a Specorator work order.` signature) collapses behind `<details class="specorator-work-order-prompt"><summary class="specorator-work-order-prompt-summary">Work order prompt</summary>…`.
- Thinking block: collapsible `.specorator-thinking-block` (confirm exact classes from `ThinkingBlockRenderer.ts`), a live "Thinking Ns…" label during streaming, a finalized "Thought for Ns" label with `durationSeconds`.
- Compact boundary: `<div class="specorator-compact-boundary"><span class="specorator-compact-boundary-label">Conversation compacted</span></div>`.

**Files:**
- Create: `blocks/TextBlock.vue`, `blocks/ThinkingBlock.vue`, `blocks/ContextCompactedMarker.vue`, `transcript/collapsible.ts`
- Test: characterization + parity tests under `tests/vue/chat/transcript/`

- [ ] **Step 1: Characterize the legacy thinking block** — construct `createThinkingBlock` + `renderStoredThinkingBlock` against a JSDOM el, snapshot classes/labels. Run, expect PASS (contract locked).
- [ ] **Step 2: Write the failing `useCollapsible` test** — click and Enter/Space toggle an `expanded` ref; `aria-expanded` reflects state.
- [ ] **Step 3: Implement `collapsible.ts`** — a composable returning `{ expanded, toggle, onKeydown }` preserving the click/Enter/Space contract of the legacy `collapsible.ts`.
- [ ] **Step 4: Write failing parity tests** for `TextBlock` (plain, work-order-prompt collapse, copy button present) and `ThinkingBlock` (live label, finalized duration label, collapse).
- [ ] **Step 5: Implement the three components** over `MarkdownHost` + `useCollapsible`. `TextBlock` takes `{ content, role, isWorkOrderPrompt }`; `ThinkingBlock` takes `{ content, durationSeconds, live }`; the work-order **segment split** (progress/needs-input/needs-approval/handoff) is deferred to Task 8's cards — here `TextBlock` renders plain markdown and Task 8 wires the split via a `workOrderSegments` prop path. Keep `TextBlock` free of work-order logic beyond the prompt-collapse `<details>`.
- [ ] **Step 6: Run all tests, expect PASS**. `npm run typecheck:vue`.
- [ ] **Step 7: Commit** — `feat(chat): TextBlock + ThinkingBlock + compact-boundary Vue blocks (unwired)`.

### Task 5: `ToolCall.vue` + `TodoListView.vue` + `WebSearchView.vue` + generic tool content

**Legacy sources:** `ToolCallRenderer.ts` (`renderToolCall`, `renderStoredToolCall`, `updateToolCallResult`, header/label/status, `isBlockedToolResult`), `toolLabel.ts`, `toolLinesExpanded.ts`, `contentFallback.ts`, `TodoListRenderer.ts` + `todoUtils.ts`, `webSearchRenderer.ts` + `webSearchExpandedHelpers.ts`, `applyPatchExpandedHelpers.ts`, `askUserQuestionRenderer.ts` (read-only answered state → also produce `AskQuestionResult.vue` here).

**DOM contract:** the `.specorator-tool-*` family — header (icon/name/summary/status pill), collapsible body, expanded lines. Read `ToolCallRenderer.ts` for the exact class set; the DOM-contract test (Task 20) enforces completeness. The status model: `running` | `completed` | `blocked` | `error` (driven by `ToolCallInfo.status`).

- [ ] **Step 1:** Characterize `renderStoredToolCall` for a completed Bash tool, a blocked tool, an error tool, a TodoWrite tool, and a WebSearch tool — snapshot header classes, status pill class, expanded-line classes. Run, expect PASS.
- [ ] **Step 2:** Failing parity test for `ToolCall.vue` header + status pill + collapsible body across the five cases; `TodoListView` item + status-icon classes; `WebSearchView` result rows; `AskQuestionResult` answered rows.
- [ ] **Step 3:** Implement `ToolCall.vue` (props `{ toolCall: ToolCallInfo }`, reads `.status`/`.result`/`.input`/`.name`), delegating specialized bodies to `TodoListView` / `WebSearchView` / `AskQuestionResult` / a generic `contentFallback`-equivalent. Tool label + icon come from the existing pure helpers in `toolLabel.ts` / `core/tools/toolIcons` (import, do not reimplement). Use `useCollapsible`.
- [ ] **Step 4:** Run tests, expect PASS. `npm run typecheck:vue`.
- [ ] **Step 5: Commit** — `feat(chat): ToolCall + Todo/WebSearch/AskQuestion-result Vue views (unwired)`.

### Task 6: `WriteEditView.vue` + `DiffView.vue`

**Legacy sources:** `WriteEditRenderer.ts` (`createWriteEditBlock`, `renderStoredWriteEdit`, `updateWriteEditWithDiff`, `finalizeWriteEditBlock`), `DiffRenderer.ts`.

**DOM contract:** the write/edit wrapper + file header + diff hunks + `±` add/remove stats. Read both files for the exact `.specorator-*` classes. Respects `settings.expandFileEditsByDefault`.

- [ ] **Step 1:** Characterize `renderStoredWriteEdit` for a Write (new file) and an Edit (diff) — snapshot wrapper/header/hunk/stat classes. Run, expect PASS.
- [ ] **Step 2:** Failing parity test for `WriteEditView` (new-file vs diff, initial-expanded setting) + `DiffView` (added/removed line classes, ± counts).
- [ ] **Step 3:** Implement both. `WriteEditView` props `{ toolCall }` reads `.input.file_path` + `.diffData`; `DiffView` props `{ diffData }` from `extractDiffData`'s shape (`SDKToolUseResult` / `core/types/diff`). Reuse the pure diff parsing in `utils/diff` — do not reimplement.
- [ ] **Step 4:** Run tests, expect PASS. `npm run typecheck:vue`.
- [ ] **Step 5: Commit** — `feat(chat): WriteEditView + DiffView Vue components (unwired)`.

### Task 7: `SubagentBlock.vue`

**Legacy sources:** `SubagentRenderer.ts`, `MessageSubagentRenderer.ts`, `subagentLifecycleResolution.ts`. Handles sync + async Task subagents and provider-lifecycle subagents, nested tool views, collapsible sections, live status.

**DOM contract:** the subagent card + header + nested tool list + status. Read the three files for classes. Uses the same `ToolCall`/`WriteEditView` child components for nested tools.

- [ ] **Step 1:** Characterize `renderTaskSubagent` (sync + async) and `renderProviderLifecycleSubagent` — snapshot card/header/status/nested-tool classes. Run, expect PASS.
- [ ] **Step 2:** Failing parity test: sync subagent with nested tools, async subagent (pending → completed status), collapse behavior.
- [ ] **Step 3:** Implement `SubagentBlock.vue` props `{ toolCall, mode, msg }`. Resolve the lifecycle adapter via `subagentLifecycleResolution` (move to a shared util location that survives the cut, or import from its current path and update in Task 18). Render nested tool calls with the `ToolCall`/`WriteEditView` components.
- [ ] **Step 4:** Run tests, expect PASS. `npm run typecheck:vue`.
- [ ] **Step 5: Commit** — `feat(chat): SubagentBlock Vue component (sync + async) (unwired)`.

### Task 8: Work-order cards + context card + images + `RuntimeErrorCard`

**Legacy sources:** `WorkOrderProgressCard.ts`, `WorkOrderNeedsInputCard.ts`, `WorkOrderNeedsApprovalCard.ts`, `WorkOrderHandoffCard.ts`, `WorkOrderProtocolDisplay.ts` (`splitWorkOrderProtocolForDisplay`), `MessageContextCard.ts`, `MessageImageRenderer.ts`, `InlineRuntimeError.ts` (+ `runtimeErrorClassification`).

- [ ] **Step 1:** Characterize each card renderer + `MessageContextCard` + `renderInlineRuntimeError` (each error kind: cli-not-found, unauthenticated, context-too-large, generic) — snapshot classes/buttons. Run, expect PASS.
- [ ] **Step 2:** Failing parity tests for the four work-order cards, `MessageContextCard` (@mention rows, open-file click), `MessageImages` (thumbnail + full-size modal trigger via `resolveImageSrc`/`showFullImage` callbacks), `RuntimeErrorCard` (classified kind, open-settings/retry/login-hint buttons wired to callbacks).
- [ ] **Step 3:** Implement the components. `splitWorkOrderProtocolForDisplay` stays a pure helper (import); `TextBlock` from Task 4 gains a `workOrderSegments` path that renders each segment via the right card (wire it here). `RuntimeErrorCard` calls `openProviderSettings`/`onRetryLastTurn` from the callbacks seam.
- [ ] **Step 4:** Run tests, expect PASS. `npm run typecheck:vue`.
- [ ] **Step 5: Commit** — `feat(chat): work-order cards + context card + images + runtime-error Vue components (unwired)`.

### Task 9: `MessageActionBar.vue`

**Legacy source:** `MessageActionBar.ts`, `messageActionButtons.ts`, `messageActions.ts`. Copy / rewind (Obsidian `Menu`) / fork / registered actions, capability-gated.

- [ ] **Step 1:** Characterize `addUserCopyButton` / `addAssistantMessageActions` / `addRewindButton` / `addForkButton` / `addRegisteredMessageActions` — snapshot toolbar/button classes. Run, expect PASS.
- [ ] **Step 2:** Failing parity test: user copy button, assistant copy, rewind button (present only when eligible + capability + callback), fork button, registered actions.
- [ ] **Step 3:** Implement `MessageActionBar.vue` props `{ msg, role, rewindEligible }`, reading capabilities via `getProviderId` + the callbacks seam (`onRewind`/`onFork`/`isRewindEligible`/`getMessageActions`/`copyText`). Rewind uses the Obsidian `Menu` for its mode submenu (import `Menu` from obsidian) exactly as the legacy code does.
- [ ] **Step 4:** Run tests, expect PASS. `npm run typecheck:vue`.
- [ ] **Step 5: Commit** — `feat(chat): MessageActionBar Vue component (unwired)`.

---

## Phase 2 — Assembly (additive, unwired)

### Task 10: `BlockList.vue` + `MessageBubble.vue`

`BlockList` dispatches over `contentBlocks` via `<component :is>`, reproducing `assistantMessageContent.renderAssistantMessageContent` (including the leftover-tool-call fallback and the legacy-content fallback for messages without `contentBlocks`). `MessageBubble` is the `.specorator-message` shell.

**DOM contract:** `<div class="specorator-message specorator-message-{role}" data-message-id="{id}" data-role="{role}"><div class="specorator-message-content" dir="auto">…</div></div>`. Assistant duration footer `<div class="specorator-response-footer"><span class="specorator-baked-duration">* {flavor} for {mm:ss}</span></div>` (skipped when a compact boundary is present). Interrupt markers (`.specorator-interrupted` / `.specorator-interrupted-hint`).

- [ ] **Step 1:** Characterize `renderStoredMessage` for: a user text message, an assistant message with mixed blocks (thinking + text + tool_use + subagent), an assistant message with a duration footer, an interrupt message, a leftover-tool-call case, and a legacy no-`contentBlocks` message. Snapshot the shell + content structure. Run, expect PASS.
- [ ] **Step 2:** Failing parity test for `BlockList` dispatch (each block type → right component; leftover tools appended; legacy fallback) and `MessageBubble` (shell attributes, user context card + images + text + action bar; assistant content + footer + interrupt indicator).
- [ ] **Step 3:** Implement both.
  - **v-for keys:** `tool_use`→`toolId`, `subagent`→`subagentId`; `text`/`thinking`/`context_compacted`/`runtime_error`→`` `${type}:${index}` `` (append-only, positionally stable).
  - `BlockList` prop `{ msg }`; computes the render list = `contentBlocks` (or legacy fallback) + leftover tool calls (ids not referenced by any `tool_use`/`subagent` block, matching `renderLeftoverToolCalls`).
  - `MessageBubble` prop `{ msg, rewindEligible }`; branches user vs assistant; `hasVisibleContent` gate reproduced from `visibleContentHelpers` (import the pure helpers).
- [ ] **Step 4:** Run tests, expect PASS. `npm run typecheck:vue`.
- [ ] **Step 5: Commit** — `feat(chat): BlockList dispatch + MessageBubble shell Vue components (unwired)`.

### Task 11: `MessageList.vue` + `WelcomeBanner.vue` + `LoadEarlierControl.vue` + `TranscriptRoot.vue`

Windowing (RENDER_WINDOW_SIZE = 80, trailing window, explicit "Load earlier"), welcome/greeting, hydration-error banner, loading spinner, and the root that mounts store + routing and hands its scroll container to the engine.

**DOM contract:** `.specorator-loading` / `.specorator-loading-spinner` / `.specorator-loading-text`, `.specorator-load-earlier` / `.specorator-load-earlier-btn`, `.specorator-hydration-error[data-error-code]`, the welcome element (read `windowedRenderSetup.ts` for its exact class + greeting structure). The scroll container is the messages element itself (`.specorator-tab-content` messages host) — `TranscriptRoot` renders it and hands it up via `SCROLL_HOST_KEY` so `StreamController.scrollToBottom` keeps working (mirrors the shell's `CONTENT_HOST_KEY` handoff).

- [ ] **Step 1:** Characterize `renderMessages` windowing (81 messages → 80 mounted + a load-earlier control; load-earlier splices the prior 80 above and preserves scroll anchor), `renderLoading`, `setHydrationError`/`clearHydrationBanner`, and `setupWindowedRender`'s welcome. Run, expect PASS.
- [ ] **Step 2:** Failing parity/behavior tests: `MessageList` mounts only the trailing window; `LoadEarlierControl` grows the window by `RENDER_WINDOW_SIZE`; `WelcomeBanner` shows greeting + hydration error; `TranscriptRoot` calls the `SCROLL_HOST_KEY` provider once with its scroll element on mount.
- [ ] **Step 3:** Implement.
  - `MessageList` prop `{ messages, renderWindowStart, rewindEligibleIds }`; `v-for` over `messages.slice(renderWindowStart)` keyed by `msg.id`; emits `loadEarlier`.
  - Windowing state (`renderWindowStart`) lives in `TranscriptRoot` (reactive ref, default `max(0, len - 80)`), decremented by `LoadEarlierControl`. Scroll-anchor preservation on load-earlier reproduces the legacy pre/post `scrollHeight`/`scrollTop` math.
  - `TranscriptRoot` mounts the store via `useTranscriptEventRouting(cb.subscribe)`, reads `store.messages`/`store.activeStream`, provides its scroll container through the injected `SCROLL_HOST_KEY` callback, and renders `WelcomeBanner` + `LoadEarlierControl` + `MessageList` + `StreamingIndicator`.
- [ ] **Step 4:** Run tests, expect PASS. `npm run typecheck:vue`.
- [ ] **Step 5: Commit** — `feat(chat): MessageList windowing + welcome/load-earlier + TranscriptRoot (unwired)`.

### Task 12: `StreamingIndicator.vue`

Reactive `isThinking` / `isWriting` / `elapsedSeconds` from `store.activeStream`, replacing `streamingIndicator.ts`'s imperative `thinkingEl` + `setInterval`.

**DOM contract:** `.specorator-thinking` container, `.specorator-thinking-flavor` label span, `.specorator-thinking-hint` timer span, the `esc to interrupt · mm:ss` text, and the `STREAMING_RESPONSE_LABEL` ("Writing response…") in collapse/writing mode.

- [ ] **Step 1:** Characterize `StreamingIndicator.render` output (label + timer classes, text format). Run, expect PASS.
- [ ] **Step 2:** Failing parity test: thinking mode shows a flavor label; writing mode shows `STREAMING_RESPONSE_LABEL`; the timer text tracks `elapsedSeconds`; hidden when `activeStream` is null or neither flag is set.
- [ ] **Step 3:** Implement `StreamingIndicator.vue` reading `store.activeStream`. The elapsed seconds come from the store (the engine owns the timer — see Task 17 — and pushes `elapsedSeconds` in the snapshot), so this component has no `setInterval`; it just renders the reactive value. Flavor word: a stable pick derived from `messageId` (not `Math.random`, which is banned in the workflow/test lane and causes churn) — reproduce `FLAVOR_TEXTS` selection deterministically per turn.
- [ ] **Step 4:** Run tests, expect PASS. `npm run typecheck:vue`.
- [ ] **Step 5: Commit** — `feat(chat): StreamingIndicator reactive Vue component (unwired)`.

---

## Phase 3 — Inline blocking cards (additive, unwired)

These become Vue components, but `InlinePromptController` keeps owning the promise/resolution the runtime awaits. The Vue card captures input and calls an injected `resolve`. Build them unwired here (mount in isolation, assert they call `resolve` with the right payload); Task 18 wires `InlinePromptController` to mount them.

**The promise contract to preserve exactly** (`controllers/InlinePromptController.ts` owns it — the cards do NOT):
- Each entry point (`showInlineQuestion` / `handleApprovalRequest` / `handleExitPlanMode` / `showPlanApproval`) returns a `Promise` and, before rendering, calls `hideThinkingIndicator()`, `hideInputContainer(el)` (adds `specorator-hidden`, **ref-counted** via `inputContainerHideDepth`), and sets `state.needsAttention = true` (the "needs attention" tab badge).
- On the card's resolve callback: clear the pending-instance field, set `state.needsAttention = false`, `restoreInputContainer(el)` (decrement depth; remove `specorator-hidden` at 0), then `resolve(result)`.
- **`destroy()`/abort resolves the promise with `null` (cancel) — never rejects.** Each card holds a single-exit `resolved` flag and self-removes its root. `dismissPendingApproval()` (turn-end / tab-lifecycle) destroys ALL pending cards, resetting `inputContainerHideDepth = 0` and `needsAttention = false`. The plan-approval dismiss resolves `{ decision: null, invalidated: true }`.
- Result types the runtime awaits: approval → `ApprovalDecision` (`'cancel'` on null); ask → `Record<string, string|string[]> | null`; exit-plan → `ExitPlanModeDecision | null`; post-plan → `{ decision: PlanApprovalDecision | null; invalidated: boolean }`.
- Approval reuses the ask-question card with `{ immediateSelect: true, showCustomInput: false, title: 'Permission required', headerEl }`; the detached `headerEl` (`.specorator-ask-approval-info` / `-tool` / `-icon` / `-tool-name` / optional `-reason` / `-blocked-path` / `-agent` / `-desc`) is re-attached inside the card root.
- `InlineAskUserQuestion` + `InlineExitPlanMode` accept an `AbortSignal` (abort → resolve null); `InlinePlanApproval` takes none.

In the Vue port, the components take a `resolve` prop (and `signal` where applicable) and own only input capture + the single-exit guard; `InlinePromptController` keeps the visibility/attention side effects. The shared `inlineChoiceCard` (`InlineChoiceList` + `activateInlineCard`) and `planContentPreview` become shared Vue sub-components reused by both plan cards.

### Task 13: `InlineApproval.vue` + `InlinePlanApproval.vue` + `InlineExitPlanMode.vue`

**Legacy sources:** the tool-approval card (find in `InlinePromptController` / `inlineChoiceCard.ts`), `InlinePlanApproval.ts`, `InlineExitPlanMode.ts`, `planContentPreview.ts`.

- [ ] **Step 1:** Characterize each legacy card's DOM (buttons, classes, preview structure). Run, expect PASS.
- [ ] **Step 2:** Failing parity tests: `InlineApproval` (Deny / Allow-once / Always-allow → resolves `ApprovalDecision`); `InlinePlanApproval` (Implement / revise / Cancel → resolves `{decision, invalidated}`); `InlineExitPlanMode` (plan preview, permission choice, approve-new-session / approve-current / feedback → resolves `ExitPlanModeDecision`). Each takes a `resolve` prop and the payload it needs.
- [ ] **Step 3:** Implement the three components with the exact button labels/classes + keyboard contract of the legacy cards. Plan preview reuses `MarkdownHost` + the pure `planContentPreview` helper.
- [ ] **Step 4:** Run tests, expect PASS. `npm run typecheck:vue`.
- [ ] **Step 5: Commit** — `feat(chat): InlineApproval + PlanApproval + ExitPlanMode Vue cards (unwired)`.

### Task 14: `InlineAskUserQuestion.vue`

The heaviest (~641 LOC imperative): tabbed per-question options, multi-select, custom "other" input, review/submit, keyboard nav. Resolves `Record<question, answer>`.

**Legacy sources:** `InlineAskUserQuestion.ts`, `askQuestionTabRenderer.ts`, `askUserQuestionOptions.ts`.

- [ ] **Step 1:** Characterize the legacy card: multi-question tab strip, per-question option list (single vs multi-select), custom-input row, submit gating (all questions answered), keyboard navigation. Snapshot classes + interaction. Run, expect PASS.
- [ ] **Step 2:** Failing parity tests: renders N question tabs; selecting an option advances/records; multi-select accumulates; custom "other" input captured; submit disabled until all answered; submit resolves `Record<question, answer>`; keyboard nav (arrows/Enter) works.
- [ ] **Step 3:** Implement `InlineAskUserQuestion.vue` reproducing the tab + options + review flow. Prefer small child components (`AskQuestionTab`, `AskQuestionOption`) mirroring the legacy split. `resolve` prop.
- [ ] **Step 4:** Run tests, expect PASS. `npm run typecheck:vue`.
- [ ] **Step 5: Commit** — `feat(chat): InlineAskUserQuestion Vue card (unwired)`.

---

## Phase 4 — Streaming write-side rewrite + cutover

This is the crux. Tasks 15–17 rewrite the engine's stream **output** from DOM-patching to reactive-data mutation while the imperative transcript is still mounted (so the existing engine tests keep the behavior honest); Task 18 flips the mount to Vue and deletes the imperative renderers.

**Key idea:** the in-flight assistant message's `contentBlocks` are appended/updated as **data** during the turn. A live text block is `{ type: 'text', content: '<growing>' }` on the active message; the coordinators append to `content` instead of creating `currentTextEl`. `activeStream` (message id, block index, flags, elapsed) is projected into the snapshot each mutation. Because a live message is just a `ChatMessage`, the Vue components from Phases 1–2 render it unchanged.

### Task 15: Reactive text/thinking coordinators

**Files:** `controllers/TextRenderCoordinator.ts`, `controllers/ThinkingRenderCoordinator.ts`, `state/ChatState.ts`, `state/types.ts`, new `controllers/activeStreamState.ts` (a small owner for active message id + block index), `controllers/StreamController.ts` (block-transition wiring).

- [ ] **Step 1:** Add characterization tests (if missing) pinning current behavior: a `text` chunk sequence produces a `{type:'text'}` content block with the concatenated content on `done`/finalize; a `thinking` chunk sequence produces a `{type:'thinking', durationSeconds}` block; collapse mode holds the placeholder then renders once. Run against current code, expect PASS.
- [ ] **Step 2:** Introduce active-stream data on `ChatState`: `activeMessageId: string | null`, `activeBlockIndex: number`, and a `getActiveStreamSnapshot(): ActiveStreamState | null` that derives `isThinking`/`isWriting`/`elapsedSeconds` (elapsed from `responseStartTime`). Add getters/setters. **Keep the old DOM-pointer fields in place** (they are deleted in Task 18).

> **The dual-write rule for Tasks 15–17 (decisive — no per-task discretion):**
> Each coordinator/StreamController path writes BOTH the new reactive data AND
> the existing DOM, in that order. The imperative `MessageRenderer` keeps
> rendering through its current DOM path (nothing regresses; the engine tests
> stay meaningful), while the new data path is proven by the `tests/vue`
> components consuming the same `ChatMessage` shape. There is NO bridge that
> asks the imperative renderer to render half-migrated data, and NO feature
> flag. Task 18 deletes the DOM writes (and the DOM-pointer fields) in one cut,
> flipping the mount to Vue. This keeps every commit shippable and the dual
> window trivially correct (the old path is untouched; the new path is only
> exercised by tests until Task 18).

- [ ] **Step 3:** Rewrite `TextRenderCoordinator.append/finalize` to grow `msg.contentBlocks[activeBlockIndex].content` as the new source of truth (dual-write rule: keep the existing `currentTextEl` render too). Collapse mode becomes the `isWriting` flag on active-stream. Update the characterization tests to assert the **data** outcome (content block content) in addition to the existing DOM outcome.
- [ ] **Step 4:** Rewrite `ThinkingRenderCoordinator.append/finalize` symmetrically (grow a `{type:'thinking'}` block; `durationSeconds` computed on finalize; `isThinking` flag).
- [ ] **Step 5:** Run `npm run test -- --selectProjects unit` (the chat controller tests) + `npm run typecheck`, expect PASS.
- [ ] **Step 6: Commit** — `refactor(chat): text/thinking coordinators grow reactive content blocks`.

### Task 16: Reactive tool-call streaming

**Files:** `controllers/StreamController.ts`, `controllers/toolCallAppend.ts`.

- [ ] **Step 1:** Characterization tests: a `tool_use` chunk appends a `ToolCallInfo` (status `running`) + a `{type:'tool_use', toolId}` content block; a `tool_result` sets `.status` (completed/blocked/error) + `.result` + (Write/Edit) `.diffData`; `tool_output` grows `.result`; `mergeExistingToolCallInput` updates `.input`. Run against current, expect PASS.
- [ ] **Step 2:** Following the Task 15 dual-write rule, make the tool paths mutate `ToolCallInfo` **data** (status/result/diffData/input) as the new source of truth while keeping the existing DOM-patch calls in place until Task 18. The reactive-data facts to establish: a `tool_use` appends a `{type:'tool_use', toolId}` content block + a `ToolCallInfo` (status `running`); `tool_result` sets `.status` (completed/blocked/error via the existing `isBlockedToolResult`/`skipsBlockedDetection` logic) + `.result` + (Write/Edit) `.diffData`; `tool_output` grows `.result` under the same `scheduleStreamContinuation` backoff; `mergeExistingToolCallInput` updates `.input`. The `toolCallElements`/`writeEditStates` Maps and the DOM-patch functions (`updateToolCallResult`, `updateRenderedToolCallHeader`, `updateWriteEditWithDiff`, `finalizeWriteEditBlock`, `renderToolCall`, `createWriteEditBlock`) stay callable for the existing DOM path and are DELETED in Task 18. `flushPendingTools`/`renderPendingTool`'s ordering guarantees must be preserved as data-append order (the block list renders in `contentBlocks` order).
- [ ] **Step 3:** Update the characterization tests to assert data outcomes. Run unit tests + typecheck, expect PASS.
- [ ] **Step 4: Commit** — `refactor(chat): tool-call streaming mutates ToolCallInfo data, not DOM`.

### Task 17: Reactive streaming indicator + `currentContentEl` reader migration

**Files:** `controllers/streamingIndicator.ts`, `controllers/StreamController.ts`, `controllers/InputController.ts`, `controllers/composerSendPhases.ts`, `tabs/tabRuntimeHost.ts`.

- [ ] **Step 1:** Replace `StreamingIndicator`'s DOM (`thinkingEl` + `setInterval`) with active-stream flag updates: `show`/`showWriting`/`hide` set `isThinking`/`isWriting` + own the 1s elapsed tick that writes `activeStream.elapsedSeconds` into `ChatState` (single interval, cleared on finalize). The Vue `StreamingIndicator` renders it. Keep the method names/signatures `StreamController` and `InputController`/`tabRuntimeHost` call (`showThinkingIndicator`/`hideThinkingIndicator`) so callers are untouched.
- [ ] **Step 2:** Migrate the `currentContentEl` readers to active-stream data:
  - `InputController` lines ~673, ~924–931, ~1034–1037: these set up / tear down the streaming target. Replace `state.currentContentEl = contentEl` with setting `activeMessageId` + resetting `activeBlockIndex`; the assistant message shell is now created as a `ChatMessage` in the store, not a DOM element. (The assistant message is already added to `ChatState.messages` — confirm and reuse; the DOM `contentEl` creation goes away.)
  - `composerSendPhases.ts` line ~246: the duration footer written into `currentContentEl` becomes `msg.durationSeconds`/`durationFlavorWord` data on the message (already read by `renderDurationFooter` / the Vue `MessageBubble`); delete the DOM write.
  - `tabRuntimeHost.ts` lines ~131–177 (the auto-turn save/restore of streaming pointers): swap the four `currentContentEl`/`currentTextEl`/`currentTextContent`/`currentThinkingState` snapshots for the active-stream data equivalents (`activeMessageId`/`activeBlockIndex`), preserving the save→run→restore contract used when an auto-turn interleaves.
- [ ] **Step 3:** Run `npm run typecheck && npm run test -- --selectProjects unit`, expect PASS. Fix any remaining `currentContentEl`/`currentTextEl` importers surfaced by typecheck.
- [ ] **Step 4: Commit** — `refactor(chat): streaming indicator + streaming target become reactive data`.

### Task 18: Hard cut — mount `TranscriptRoot`, delete the imperative transcript

**Files:** `tabs/tabControllerSetup.ts`, `tabs/tabFactory.ts` (or wherever `messagesEl` is created), `state/ChatState.ts`, `state/types.ts`, `controllers/InlinePromptController.ts` (mount inline cards), plus the deletion set from the File Structure section.

- [ ] **Step 1:** Add a `mountTranscript(tab, plugin, component)` that `createApp(TranscriptRoot)` + `app.use(createTranscriptPinia())`, provides `APP_KEY`/`COMPONENT_KEY`/`PLUGIN_KEY`/`CALLBACKS_KEY`, and mounts into the per-tab messages host element. Build `TranscriptCallbacks` from the existing `SpecoratorView`/controller methods (rewind→`conversationController.rewind`, fork→fork callback, `openProviderSettings`→`openSpecoratorProviderSettings`, `onRetryLastTurn`→`inputController.retryLastTurn`, image/file/copy helpers from the old `MessageImageRenderer`/`MessageActionBar`, `subscribe`→a new `SpecoratorView.projectTranscript()` that pushes `{messages, activeStream}` on every `ChatState.onMessagesChanged` + streaming transition, mirroring `emitChatShellChange`). Store the app on the tab for disposal in `onClose`.
- [ ] **Step 2:** Replace `buildTabMessageRenderer` + the renderer wiring: `StreamController`/`ConversationController`/`InputController` no longer take a `renderer`. Their few remaining `renderer.*` calls (e.g. `ConversationController.renderMessages` on switch/load, `renderLoading`) become store pushes via `projectTranscript()` — the Vue `TranscriptRoot` renders from the store, so "render messages" is "set `ChatState.messages` + emit". `renderMessagesChunked`'s cooperative yield is replaced by the Vue list's natural windowing (only 80 mount); if a spinner-on-switch is still wanted, drive it from a store `isHydrating` flag.
- [ ] **Step 3:** Wire `InlinePromptController` to mount the four Vue inline cards into the active message's content area (or a dedicated inline-prompt host element) and resolve its existing promise from the card's `resolve`. `dismissPendingApproval` unmounts the card app. Keep the composer-hide (depth-counted) + `needsAttention` behavior exactly.
- [ ] **Step 4:** Delete the imperative renderers + DOM-patch coordinator paths (the File Structure deletion set). Move `codeBlockFormatter.ts` and `subagentLifecycleResolution.ts` to survive-the-cut locations and fix `markdownHostRender.ts` / `SubagentBlock.vue` imports. Remove `ChatState`'s DOM-pointer fields (`currentContentEl`, `currentTextEl`, `currentTextContent`, `currentThinkingState`, `thinkingEl`, `toolCallElements`, `writeEditStates`, and the raw-element side of `pendingTools`) from `state/types.ts` + `ChatState.ts` + `createInitialState` + `resetStreamingState`/`clearMaps`.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm run test && npm run test:vue && npm run build`, expect PASS. Grep for any lingering imports of the deleted modules and fix.
- [ ] **Step 6: Commit** — `feat(chat): cut the transcript over to a Vue island; delete imperative MessageRenderer + block renderers`.

---

## Phase 5 — Guardrails, perf, docs

### Task 19: Perf suite migration

**Files:** `tests/perf/messageRenderer.perf.test.ts`, `tests/perf/navigationSidebar.perf.test.ts`, possibly new `tests/vue/chat/transcript/transcriptScaling.test.ts`.

- [ ] **Step 1:** Re-point / rewrite `messageRenderer.perf` so its guard (mounted `.specorator-message` ≤ `RENDER_WINDOW_SIZE`, DOM/listeners O(window)) runs against the Vue transcript, OR — if the perf lane can't mount Vue — mirror the assertion in `tests/vue/chat/transcript/transcriptScaling.test.ts` (like `agentBoardScaling.test.ts`) and reduce the perf-lane spec to what still applies. Add the one-chunk→one-block assertion: one streaming mutation re-renders exactly one block/MarkdownHost.
- [ ] **Step 2:** Confirm `navigationSidebar.perf` stays green against Vue-rendered DOM (it scans `.specorator-message-user` + `offsetTop` — the DOM contract guarantees these exist). If it constructs the old renderer, re-point it to mount the Vue transcript or a fixture emitting the same DOM.
- [ ] **Step 3:** Run `npm run test:perf`, expect PASS.
- [ ] **Step 4: Commit** — `test(chat): migrate transcript perf guards to the Vue island`.

### Task 20: DOM-contract test + guardrail re-lock + docs

**Files:** `tests/vue/chat/transcript/domContract.test.ts`, `jest.config`/`vitest.config` coverage globs, `scripts/loc-baseline.json`, `scripts/quality-baseline.json`, `src/features/chat/CLAUDE.md`, root `CLAUDE.md`, `docs/adr/0005-chat-shell-vue-migration.md` (append sub-project 2) or a new ADR, `.specorator-vue` namespace/css guards.

- [ ] **Step 1:** Write `domContract.test.ts`: mount `TranscriptRoot` with a fixture conversation exercising every block type + user/assistant + streaming, and assert the presence of EVERY class/attribute the un-migrated consumers query. The verified contract set (from the characterization maps — keep this list authoritative and in sync with the component tasks):
  - **Message shell / consumer-critical:** `.specorator-message`, `.specorator-message-user`, `.specorator-message-assistant`, `.specorator-message-content`, `[data-message-id]`, `[data-role]`, `.specorator-text-block`, `.specorator-response-footer` + `.specorator-baked-duration`, `.specorator-interrupted` + `.specorator-interrupted-hint`.
  - **Chrome:** `.specorator-loading` / `-spinner` / `-text`, `.specorator-load-earlier` / `-btn`, `.specorator-hydration-error[data-error-code]`, the welcome element class (from `windowedRenderSetup.ts`), `.specorator-work-order-prompt` / `-summary`.
  - **Collapsible state (universal):** `.expanded` (on wrapper), `.specorator-hidden` (on content), `aria-expanded`.
  - **Thinking:** `.specorator-thinking-block` / `-header` / `-label` / `-content`; streaming indicator `.specorator-thinking` / `.specorator-thinking-flavor` / `.specorator-thinking-hint`.
  - **Tool call:** `.specorator-tool-call` (+`.specorator-tool-call-bash`) `[data-tool-id]`, `.specorator-tool-header` / `-icon` / `-name` / `-summary` / `-current` / `-status` (+`status-{running|completed|blocked|error}`), `.specorator-tool-content` (+`-todo`/`-ask`), `.specorator-tool-lines` / `-line` (+`.hoverable`) / `-truncated` / `-empty`, `.specorator-tool-result-row` / `-result-text`, `.specorator-tool-link` / `-link-icon` / `-link-title`, `.specorator-tool-search-item`, `.specorator-tool-patch-section`, `.specorator-tool-bash-command`.
  - **Write/Edit + diff:** `.specorator-write-edit-block` (+`.error`/`.done`) `[data-tool-id]`, `-header` / `-icon` / `-name` / `-summary` / `-stats` / `-status` / `-content` / `-diff-row` / `-diff` / `-loading` / `-error` / `-done-text`; `.specorator-diff-hunk` / `-line` (+`-insert`/`-delete`/`-equal`) / `-prefix` / `-text` / `-separator` / `-no-changes`; stats `span.added` / `span.removed`.
  - **Todo:** `.specorator-todo-item` (+`specorator-todo-{status}`) / `-status-icon` / `-text`; `.specorator-todo-panel-content` / `-list-container`.
  - **Subagent:** `.specorator-subagent-list` `[data-subagent-id]`/`[data-async-subagent-id]`, `-header` / `-icon` / `-label` / `-status` (+`status-*`) / `-status-text` / `-content` / `-section` (+`-prompt`/`-result`) / `-section-header` / `-section-title` / `-section-body` / `-prompt-text` / `-result-output` / `-tools` / `-tool-item` (+`specorator-subagent-tool-{status}`) `[data-tool-id]` / `-tool-header` / `-tool-icon` / `-tool-name` / `-tool-summary` / `-tool-status` / `-tool-content` / `-tool-empty`.
  - **Compact / runtime error:** `.specorator-compact-boundary` / `-label`; `.specorator-runtime-error-card` (+`specorator-runtime-error-{kind}`) / `-header` / `-icon` / `-title` / `-body` / `-hint*` / `-details*` / `-actions` / `-button` (+`-button-primary`).
  - **Ask (answered):** `.specorator-ask-review` / `-review-pair` / `-review-num` / `-review-body` / `-review-q-text` / `-review-a-text` / `-review-empty`.
  - **Work-order cards:** `.specorator-work-order-progress-card*`, `-needs-input-card*`, `-needs-approval-card*`, `-handoff-card*` (see the characterization map for the full per-card subtree).
  - **Context card / images / actions:** `.specorator-context-card*`, `.specorator-message-images` / `-image` / `-image-fallback`, `.specorator-user-msg-actions` / `-copy-btn` / `-action-btn`, `.specorator-message-rewind-btn`, `.specorator-message-fork-btn`, `.specorator-text-copy-btn`, `.specorator-text-actions` / `-action-btn`.

  This is the regression backstop for the four still-imperative consumers; the navigation sidebar in particular depends on `.specorator-message-user`.
- [ ] **Step 2:** Coverage: confirm Jest `collectCoverageFrom` already excludes `src/features/chat/ui/vue/**` (it does, from the shell); add the new transcript tree to Vitest `coverage.include` if not covered by the existing glob.
- [ ] **Step 3:** Re-lock ratchets: `npm run check:loc -- --update` (expect a large net deletion — `MessageRenderer` + `rendering/*` + DOM-patch paths out, SFCs excluded from LOC), update the `SpecoratorView.ts`/`StreamController.ts`/`ChatState.ts` allowlist reasons, `npm run check:quality` (coverage-free) and update `scripts/quality-baseline.json` if it improved. Run `npm run check:css` + the `.specorator-vue` namespace guard.
- [ ] **Step 4:** Docs: update `src/features/chat/CLAUDE.md` (rendering pipeline is now a Vue island; add a "Transcript Vue Island" section mirroring the "Chat Shell Vue Island" one), the root `CLAUDE.md` table row for `features/chat`, and append an ADR entry recording sub-project 2's completion + the DOM-contract constraint the remaining sub-projects depend on.
- [ ] **Step 5:** `npm run typecheck && npm run typecheck:vue && npm run lint && npm run test && npm run test:vue && npm run test:perf && npm run build && npm run check:loc && npm run check:css && npm run check:quality`, expect all PASS.
- [ ] **Step 6: Commit** — `chore(chat): DOM-contract test, ratchet re-lock, ADR + CLAUDE docs for the transcript island`.

---

## Manual vault smoke checklist (merge gate — the accepted big-bang trade-off)

Before opening the PR for review, verify in a live vault (all providers where applicable):
- Live streaming: text, thinking (collapse + expand), tool calls (running→completed/blocked/error), collapse-mode placeholder→one-pass render, long Bash `tool_output` growth.
- Tool-result patching, Write/Edit diffs (new file + edit), subagents (sync + async, nested tools).
- All four inline blocking cards (tool approval, ask-user-question multi-question/multi-select/custom, exit-plan-mode, post-plan approval).
- Work-order cards (progress/needs-input/needs-approval/handoff) in a work-order run tab.
- Windowing (>80 messages) + Load earlier + scroll anchor; rewind + fork; duration footer.
- Navigation sidebar + editor/browser/canvas selection still tracking against Vue DOM; drag-drop overlay.
- Cross-window popout leaf: transcript renders, streams, and the markdown host works in the popout `window`.
- Conversation switch / history load / new conversation / hydration-error banner.
```
