<script setup lang="ts">
/**
 * Renders a markdown string as DOM via Vue's `h()` render function (PR-ASV-7,
 * agent-sidepanel-v2 D-ASV-5). Used by `MessageList.vue` for both completed
 * assistant turns and in-flight streaming bubbles, replacing the previous
 * `<pre>{{ text }}</pre>` plain-text rendering.
 *
 * The parser is intentionally small and hand-rolled to avoid an external
 * dependency for the smallest mergeable PR. It supports the subset Claudian's
 * plain markdown blocks need:
 *
 *   - Paragraphs (blank-line separated)
 *   - Fenced code blocks (``` … ```), optionally with a language hint
 *   - Blockquotes (`> …`)
 *   - Unordered lists (`- ` / `* ` / `+ `)
 *   - Ordered lists (`1. `)
 *   - Inline: **bold**, *italic*, `code`, [text](url)
 *
 * DOM safety (ADR-008 / project-wide DOM construction rules):
 *
 *   - Output is built via `h()`, NOT `v-html` (which is banned by
 *     `vue/no-v-html`) and NOT `innerHTML` (banned by `no-restricted-properties`).
 *   - All user text reaches the DOM as `children` strings — Vue escapes them on
 *     write. Embedded HTML tags such as `<script>` or `<img onerror>` appear as
 *     literal text content; the browser never parses them.
 *   - Link `href` values that don't match an http(s)/mailto allowlist are
 *     emitted without an `href` attribute so they cannot smuggle
 *     `javascript:` URIs.
 */
import { computed, h, inject, onBeforeUnmount, ref, watch, type VNode } from 'vue';
import { MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import type { MarkdownRenderPort } from '@/domain/ports/MarkdownRenderPort';

const props = defineProps<{
	/** Raw markdown source to render. May be empty. */
	text: string;
}>();

interface ParagraphBlock {
	type: 'paragraph';
	text: string;
}

interface CodeBlock {
	type: 'code';
	lang: string | null;
	text: string;
}

interface BlockquoteBlock {
	type: 'blockquote';
	text: string;
}

interface ListBlock {
	type: 'list';
	ordered: boolean;
	items: string[];
}

type Block = ParagraphBlock | CodeBlock | BlockquoteBlock | ListBlock;

interface BlockMatch {
	block: Block | null;
	next: number;
}

const FENCE_OPEN = /^```([\w-]*)\s*$/;
const FENCE_CLOSE = /^```\s*$/;
const BLOCKQUOTE = /^>\s?/;
const UL_ITEM = /^[-*+]\s+/;
const OL_ITEM = /^\d+\.\s+/;

function isBlockBoundary(line: string): boolean {
	return (
		line.trim() === '' ||
		line.startsWith('```') ||
		BLOCKQUOTE.test(line) ||
		UL_ITEM.test(line) ||
		OL_ITEM.test(line)
	);
}

function parseFence(lines: string[], i: number): BlockMatch | null {
	const m = FENCE_OPEN.exec(lines[i]);
	if (m === null) return null;
	const lang = m[1].length > 0 ? m[1] : null;
	const buf: string[] = [];
	let j = i + 1;
	while (j < lines.length && !FENCE_CLOSE.test(lines[j])) {
		buf.push(lines[j]);
		j++;
	}
	if (j < lines.length) j++; // consume closing fence
	return { block: { type: 'code', lang, text: buf.join('\n') }, next: j };
}

function parseBlockquote(lines: string[], i: number): BlockMatch | null {
	if (!BLOCKQUOTE.test(lines[i])) return null;
	const buf: string[] = [];
	let j = i;
	while (j < lines.length && BLOCKQUOTE.test(lines[j])) {
		buf.push(lines[j].replace(BLOCKQUOTE, ''));
		j++;
	}
	return { block: { type: 'blockquote', text: buf.join('\n') }, next: j };
}

function parseList(
	lines: string[],
	i: number,
	pattern: RegExp,
	ordered: boolean,
): BlockMatch | null {
	if (!pattern.test(lines[i])) return null;
	const items: string[] = [];
	let j = i;
	while (j < lines.length && pattern.test(lines[j])) {
		items.push(lines[j].replace(pattern, ''));
		j++;
	}
	return { block: { type: 'list', ordered, items }, next: j };
}

function parseParagraph(lines: string[], i: number): BlockMatch {
	const buf: string[] = [lines[i]];
	let j = i + 1;
	while (j < lines.length && !isBlockBoundary(lines[j])) {
		buf.push(lines[j]);
		j++;
	}
	return { block: { type: 'paragraph', text: buf.join('\n') }, next: j };
}

/**
 * Splits the raw markdown source into structural blocks. Fenced code blocks
 * are captured first so their contents are never re-parsed as paragraphs.
 */
function parseBlocks(source: string): Block[] {
	const blocks: Block[] = [];
	const lines = source.replace(/\r\n/g, '\n').split('\n');
	let i = 0;

	while (i < lines.length) {
		if (lines[i].trim() === '') {
			i++;
			continue;
		}

		const match =
			parseFence(lines, i) ??
			parseBlockquote(lines, i) ??
			parseList(lines, i, UL_ITEM, false) ??
			parseList(lines, i, OL_ITEM, true) ??
			parseParagraph(lines, i);

		if (match.block !== null) blocks.push(match.block);
		i = match.next;
	}

	return blocks;
}

/**
 * Inline token types used by `parseInline`. A "text" token is a plain string
 * that Vue will HTML-escape on insertion; structural tokens carry already-
 * parsed children.
 */
type InlineToken =
	| { type: 'text'; text: string }
	| { type: 'bold'; children: InlineToken[] }
	| { type: 'italic'; children: InlineToken[] }
	| { type: 'code'; text: string }
	| { type: 'link'; href: string; children: InlineToken[] };

/**
 * Returns the link `href` if it is safe to emit, or `null` to drop the
 * attribute. Anything outside the http/https/mailto allowlist (notably
 * `javascript:` and `data:` URIs) is rejected.
 */
function safeHref(href: string): string | null {
	const trimmed = href.trim();
	if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
	// Allow protocol-relative and root-relative paths.
	if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
	return null;
}

interface InlineMatch {
	token: InlineToken;
	next: number;
}

function matchInlineCode(source: string, i: number): InlineMatch | null {
	if (source[i] !== '`') return null;
	const end = source.indexOf('`', i + 1);
	if (end === -1) return null;
	return { token: { type: 'code', text: source.slice(i + 1, end) }, next: end + 1 };
}

function matchLink(source: string, i: number): InlineMatch | null {
	if (source[i] !== '[') return null;
	const labelEnd = source.indexOf(']', i + 1);
	if (labelEnd === -1 || source[labelEnd + 1] !== '(') return null;
	// Codex P2 on PR #373: walk the URL with parenthesis balancing so links
	// whose href contains parens (e.g. `[spec](https://example.com/foo(bar))`)
	// don't get truncated at the first `)`. Tracks nesting depth; the
	// matching close-paren for the outer `(` is depth 0 → -1 transition.
	let depth = 0;
	let hrefEnd = -1;
	for (let j = labelEnd + 2; j < source.length; j++) {
		const ch = source[j];
		if (ch === '(') {
			depth++;
		} else if (ch === ')') {
			if (depth === 0) {
				hrefEnd = j;
				break;
			}
			depth--;
		}
	}
	if (hrefEnd === -1) return null;
	const label = source.slice(i + 1, labelEnd);
	const href = source.slice(labelEnd + 2, hrefEnd);
	return {
		token: { type: 'link', href, children: parseInline(label) },
		next: hrefEnd + 1,
	};
}

function matchBold(source: string, i: number): InlineMatch | null {
	if (source[i] !== '*' || source[i + 1] !== '*') return null;
	const end = source.indexOf('**', i + 2);
	if (end === -1) return null;
	return {
		token: { type: 'bold', children: parseInline(source.slice(i + 2, end)) },
		next: end + 2,
	};
}

function matchItalic(source: string, i: number): InlineMatch | null {
	if (source[i] !== '*' || source[i + 1] === '*') return null;
	const end = source.indexOf('*', i + 1);
	if (end === -1 || source[end + 1] === '*') return null;
	return {
		token: { type: 'italic', children: parseInline(source.slice(i + 1, end)) },
		next: end + 1,
	};
}

/**
 * Tokenises a single inline span. Order of precedence: inline code, links,
 * bold, italic. Inline code is captured first so its contents are not
 * re-parsed (so backtick literals can contain `**` etc).
 */
function parseInline(source: string): InlineToken[] {
	const tokens: InlineToken[] = [];
	let i = 0;
	let textBuf = '';

	const flushText = () => {
		if (textBuf.length > 0) {
			tokens.push({ type: 'text', text: textBuf });
			textBuf = '';
		}
	};

	while (i < source.length) {
		const match =
			matchInlineCode(source, i) ??
			matchLink(source, i) ??
			matchBold(source, i) ??
			matchItalic(source, i);
		if (match !== null) {
			flushText();
			tokens.push(match.token);
			i = match.next;
			continue;
		}
		textBuf += source[i];
		i++;
	}

	flushText();
	return tokens;
}

function renderInline(tokens: InlineToken[]): (VNode | string)[] {
	return tokens.map((tok) => {
		switch (tok.type) {
			case 'text':
				return tok.text;
			case 'bold':
				return h('strong', renderInline(tok.children));
			case 'italic':
				return h('em', renderInline(tok.children));
			case 'code':
				return h('code', { class: 'sp-markdown__code' }, tok.text);
			case 'link': {
				const safe = safeHref(tok.href);
				const attrs: Record<string, string> =
					safe !== null ? { href: safe, rel: 'noopener noreferrer', target: '_blank' } : {};
				return h('a', { class: 'sp-markdown__link', ...attrs }, renderInline(tok.children));
			}
		}
	});
}

function renderBlock(block: Block): VNode {
	switch (block.type) {
		case 'paragraph':
			return h('p', { class: 'sp-markdown__p' }, renderInline(parseInline(block.text)));
		case 'code': {
			const codeAttrs: Record<string, string> = { class: 'sp-markdown__pre-code' };
			if (block.lang !== null) codeAttrs['data-lang'] = block.lang;
			return h('pre', { class: 'sp-markdown__pre' }, [h('code', codeAttrs, block.text)]);
		}
		case 'blockquote':
			return h(
				'blockquote',
				{ class: 'sp-markdown__blockquote' },
				renderInline(parseInline(block.text)),
			);
		case 'list': {
			const tag = block.ordered ? 'ol' : 'ul';
			return h(
				tag,
				{ class: 'sp-markdown__list' },
				block.items.map((item) =>
					h('li', { class: 'sp-markdown__li' }, renderInline(parseInline(item))),
				),
			);
		}
	}
}

const blocks = computed<Block[]>(() => parseBlocks(props.text));

/**
 * Optional `MarkdownRenderPort` (top-1 gap from comparative review).
 * Provided only by the Obsidian view (`AgentSidepanelView.onOpen`); when
 * present we hand `text` off to `MarkdownRenderer.render` for full GFM
 * tables, code syntax highlighting, math, wikilinks, image embeds,
 * mermaid. When absent (tests, GitHub Pages standalone), we fall back
 * to the hand-rolled VNode tree below.
 */
const renderPort = inject<MarkdownRenderPort | undefined>(MARKDOWN_RENDER_PORT, undefined);
const nativeContainer = ref<HTMLElement | null>(null);
let nativeDisposer: (() => void) | null = null;
/**
 * Monotonic render sequence (Codex P1 on PR #377). `renderPort.render`
 * is async, so rapid `text` updates (e.g. streaming assistant tokens
 * during PR-ASV-2-ui) could land out of order: an older render
 * resolving after a newer one would repaint stale markdown AND
 * overwrite `nativeDisposer`, leaking the newer Obsidian Component's
 * listeners + child widgets. Each render captures `seq` on dispatch
 * and discards itself on resolve if `latestSeq` has moved past it.
 */
let latestSeq = 0;

async function rerenderNative(): Promise<void> {
	if (renderPort === undefined) return;
	const el = nativeContainer.value;
	if (el === null) return;
	const seq = ++latestSeq;
	// Dispose the prior render synchronously so its DOM + listeners are
	// gone before the next render starts writing into the container.
	if (nativeDisposer !== null) {
		nativeDisposer();
		nativeDisposer = null;
	}
	const disposer = await renderPort.render({ markdown: props.text, container: el });
	// If a newer render started while this one was awaiting, drop this
	// result: dispose its DOM and leave `nativeDisposer` untouched.
	if (seq !== latestSeq) {
		disposer();
		return;
	}
	nativeDisposer = disposer;
}

watch(
	() => props.text,
	() => {
		void rerenderNative();
	},
	{ immediate: true, flush: 'post' },
);

onBeforeUnmount(() => {
	// Bump latestSeq so any in-flight render's tail recognises it lost
	// the race and disposes itself rather than touching the freed
	// container.
	latestSeq++;
	if (nativeDisposer !== null) {
		nativeDisposer();
		nativeDisposer = null;
	}
});
</script>

<template>
	<div
		v-if="renderPort !== undefined"
		ref="nativeContainer"
		class="sp-markdown sp-markdown--native"
		data-testid="agent-markdown-block"
	/>
	<div v-else class="sp-markdown" data-testid="agent-markdown-block">
		<component :is="renderBlock(block)" v-for="(block, index) in blocks" :key="index" />
	</div>
</template>

<style scoped>
.sp-markdown {
	font-size: 0.875rem;
	color: var(--sp-text-normal);
	word-break: break-word;
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
	background: var(--sp-bg-primary-alt, var(--sp-bg-primary));
	border: 1px solid var(--sp-border);
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
	background: var(--sp-border);
	font-family: var(--font-monospace, ui-monospace, monospace);
	font-size: 0.85em;
}

.sp-markdown :deep(.sp-markdown__blockquote) {
	margin: 0 0 0.5rem;
	padding: 0.25rem 0.625rem;
	border-left: 3px solid var(--sp-border);
	color: var(--sp-text-muted);
	white-space: pre-wrap;
}

.sp-markdown :deep(.sp-markdown__list) {
	margin: 0 0 0.5rem;
	padding-inline-start: 1.25rem;
}

.sp-markdown :deep(.sp-markdown__li) {
	margin: 0 0 0.125rem;
}

.sp-markdown :deep(.sp-markdown__link) {
	color: var(--sp-text-accent);
	text-decoration: underline;
}
</style>
