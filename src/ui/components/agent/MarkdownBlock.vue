<script setup lang="ts">
/**
 * Renders a markdown string by delegating to `MarkdownRenderPort` (WP-4
 * markdown hardening). The parser that used to live inside this SFC has
 * moved to `internal/markdown-parser.ts`; the standalone / unit-test
 * builds inject `MockMarkdownRenderPort` / `LocalStorageMarkdownRenderPort`
 * so the port is the only path for completed assistant turns.
 *
 * `streaming` prop bypass: while a turn is in-flight, `MessageList` passes
 * `:streaming="true"` and the component renders raw `<pre>` text — no
 * markdown parsing, no port round-trip — to avoid the per-token native
 * re-render flicker. On stream complete the parent flips it to `false`
 * and the port renders the final tree once.
 *
 * Port-only invariant: throws at mount if `MARKDOWN_RENDER_PORT` is
 * missing. DOM safety: streaming branch escapes via Vue interpolation;
 * port branch writes into a `ref`-bound container — neither uses
 * `innerHTML` (ADR-008).
 */
import { inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import type { MarkdownRenderPort } from '@/domain/ports/MarkdownRenderPort';

const props = withDefaults(
	defineProps<{
		/** Raw markdown source to render. May be empty. */
		text: string;
		/**
		 * When `true`, render `text` as raw `<pre>` content with no markdown
		 * parsing. Used by `MessageList`'s in-flight streaming bubble to
		 * avoid per-token reparse / re-mount flicker.
		 */
		streaming?: boolean;
	}>(),
	{ streaming: false },
);

const injectedPort = inject<MarkdownRenderPort | undefined>(MARKDOWN_RENDER_PORT, undefined);
if (injectedPort === undefined) {
	throw new Error(
		'MarkdownBlock requires MARKDOWN_RENDER_PORT to be provided. ' +
			'Check that the host bridge (ObsidianBridge / MockBridge / LocalStorageBridge) ' +
			'wired its MarkdownRenderPort adapter via app.provide(MARKDOWN_RENDER_PORT, …).',
	);
}
// Narrow the optional inject result into a non-optional local so the
// async closure below doesn't have to re-check on every invocation.
const renderPort: MarkdownRenderPort = injectedPort;

const portContainer = ref<HTMLElement | null>(null);
let portDisposer: (() => void) | null = null;
/**
 * Monotonic render sequence (Codex P1 on PR #377). `renderPort.render`
 * is async, so rapid `text` updates (e.g. one-shot final delta + a
 * follow-up edit) could land out of order: an older render resolving
 * after a newer one would repaint stale markdown AND overwrite
 * `portDisposer`, leaking the newer Obsidian Component's listeners +
 * child widgets. Each render captures `seq` on dispatch and discards
 * itself on resolve if `latestSeq` has moved past it.
 */
let latestSeq = 0;

async function rerenderViaPort(): Promise<void> {
	const el = portContainer.value;
	if (el === null) return;
	const seq = ++latestSeq;
	// Dispose the prior render synchronously so its DOM + listeners are
	// gone before the next render starts writing into the container.
	if (portDisposer !== null) {
		portDisposer();
		portDisposer = null;
	}
	const disposer = await renderPort.render({ markdown: props.text, container: el });
	// If a newer render started while this one was awaiting, drop this
	// result: dispose its DOM and leave `portDisposer` untouched.
	if (seq !== latestSeq) {
		disposer();
		return;
	}
	portDisposer = disposer;
}

// Initial render runs on mount when `portContainer` is populated. We
// can't use `immediate: true` on the watch below — that fires
// synchronously at setup time, before the template has bound the ref.
onMounted(() => {
	if (!props.streaming) void rerenderViaPort();
});

watch(
	() => [props.text, props.streaming] as const,
	([, streaming]) => {
		// While streaming, the port branch is unmounted (v-if). Drop any
		// stale port-rendered DOM and skip the port; the raw <pre> handles
		// updates via interpolation.
		if (streaming) {
			if (portDisposer !== null) {
				latestSeq++;
				portDisposer();
				portDisposer = null;
			}
			return;
		}
		void rerenderViaPort();
	},
	{ flush: 'post' },
);

onBeforeUnmount(() => {
	// Bump latestSeq so any in-flight render's tail recognises it lost
	// the race and disposes itself rather than touching the freed
	// container.
	latestSeq++;
	if (portDisposer !== null) {
		portDisposer();
		portDisposer = null;
	}
});
</script>

<template>
	<pre
		v-if="streaming"
		class="sp-markdown sp-markdown--streaming"
		data-testid="agent-markdown-block"
	>{{ text }}</pre>
	<div
		v-else
		ref="portContainer"
		class="sp-markdown sp-markdown--native"
		data-testid="agent-markdown-block"
	/>
</template>

<style scoped>
.sp-markdown {
	font-size: 0.875rem;
	color: var(--text-normal);
	word-break: break-word;
}

.sp-markdown--streaming {
	margin: 0;
	padding: 0;
	background: transparent;
	border: 0;
	white-space: pre-wrap;
	font-family: inherit;
	font-size: inherit;
}

.sp-markdown :deep(.sp-markdown__p) {
	margin: 0 0 0.5rem;
	white-space: pre-wrap;
}

.sp-markdown :deep(.sp-markdown__p):last-child {
	margin-bottom: 0;
}

.sp-markdown :deep(.sp-markdown__pre) {
	margin: 0 0 0.5rem;
	padding: 0.5rem 0.625rem;
	border-radius: 4px;
	background: var(--background-primary-alt, var(--background-primary));
	border: 1px solid var(--background-modifier-border);
	overflow-x: auto;
	font-size: 0.8125rem;
}

.sp-markdown :deep(.sp-markdown__pre-code) {
	font-family: var(--font-monospace, ui-monospace, monospace);
	white-space: pre;
}

.sp-markdown :deep(.sp-markdown__code) {
	padding: 0.05rem 0.25rem;
	border-radius: 3px;
	background: var(--background-modifier-border);
	font-family: var(--font-monospace, ui-monospace, monospace);
	font-size: 0.85em;
}

.sp-markdown :deep(.sp-markdown__blockquote) {
	margin: 0 0 0.5rem;
	padding: 0.25rem 0.625rem;
	border-left: 3px solid var(--background-modifier-border);
	color: var(--text-muted);
	white-space: pre-wrap;
}

.sp-markdown :deep(.sp-markdown__list) {
	margin: 0 0 0.5rem;
	padding-left: 1.25rem;
}

.sp-markdown :deep(.sp-markdown__li) {
	margin: 0 0 0.125rem;
}

.sp-markdown :deep(.sp-markdown__link) {
	color: var(--text-accent);
	text-decoration: underline;
}
</style>
