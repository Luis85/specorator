/**
 * Pure markdown parser extracted from `MarkdownBlock.vue` (WP-4,
 * asv3-wp04-markdown-hardening). The Vue component now delegates rendering
 * to `MarkdownRenderPort` exclusively for completed assistant turns; this
 * module backs the standalone-build and unit-test adapters
 * (`MockMarkdownRenderPort`, `LocalStorageMarkdownRenderPort`).
 *
 * The parser is intentionally small and hand-rolled to avoid an external
 * dependency. It supports the subset Claudian's plain markdown blocks need:
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
 *   - Output is built by appending real DOM nodes (`document.createElement`
 *     + `textContent`) — never `innerHTML` / `outerHTML` /
 *     `insertAdjacentHTML` (banned by `no-restricted-properties`).
 *   - All user text reaches the DOM as `textContent`. Embedded HTML tags
 *     such as `<script>` or `<img onerror>` appear as literal text content;
 *     the browser never parses them.
 *   - Link `href` values that don't pass `safeHref`'s explicit allowlist
 *     are emitted without an `href` attribute so they cannot smuggle
 *     `javascript:` / `data:` / `file:` / `blob:` / `vbscript:` / `about:`
 *     / `chrome:` / `chrome-extension:` / `obsidian:` URIs, or a
 *     protocol-relative `//host` reference.
 */

export interface ParagraphBlock {
	type: 'paragraph';
	text: string;
}

export interface CodeBlock {
	type: 'code';
	lang: string | null;
	text: string;
}

export interface BlockquoteBlock {
	type: 'blockquote';
	text: string;
}

export interface ListBlock {
	type: 'list';
	ordered: boolean;
	items: string[];
}

export type Block = ParagraphBlock | CodeBlock | BlockquoteBlock | ListBlock;

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
export function parseBlocks(source: string): Block[] {
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
 * that gets `textContent`-set on insertion; structural tokens carry already-
 * parsed children.
 */
export type InlineToken =
	| { type: 'text'; text: string }
	| { type: 'bold'; children: InlineToken[] }
	| { type: 'italic'; children: InlineToken[] }
	| { type: 'code'; text: string }
	| { type: 'link'; href: string; children: InlineToken[] };

/**
 * Explicit allowlist for link hrefs (WP-4 hardening). Returns the trimmed
 * href if it is safe to emit, or `null` to drop the attribute. The pass is:
 *
 *   1. Deny-list explicit dangerous schemes by name (case-insensitive,
 *      whitespace-tolerant) — covers `javascript:`, `data:`, `file:`,
 *      `blob:`, `vbscript:`, `about:`, `chrome:`, `chrome-extension:`,
 *      `obsidian:`.
 *   2. Reject protocol-relative `//host` references — they inherit the
 *      page protocol and can navigate to attacker-controlled origins.
 *   3. Accept the explicit allowlist: `http(s):`, `mailto:`, root-relative
 *      paths (`/…`), and fragments (`#…`).
 *   4. Default-reject everything else (custom schemes, bare hostnames,
 *      relative paths without leading `/`).
 */
export function safeHref(href: string): string | null {
	const trimmed = href.trim();
	if (trimmed.length === 0) return null;
	// 1. Explicit deny-list (case-insensitive). The `i` flag plus the
	//    leading-whitespace `.trim()` covers `JAVASCRIPT:`, `\tjavascript:`,
	//    `Javascript:` etc.
	const denyList =
		/^(?:javascript|data|file|blob|vbscript|about|chrome|chrome-extension|obsidian):/i;
	if (denyList.test(trimmed)) return null;
	// 2. Reject protocol-relative `//host` (would inherit the page's
	//    protocol; not in our allowlist).
	if (trimmed.startsWith('//')) return null;
	// 3. Allowlist.
	if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
	if (trimmed.startsWith('/')) return trimmed;
	if (trimmed.startsWith('#')) return trimmed;
	// 4. Default reject (unknown scheme, bare hostname, relative path).
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
export function parseInline(source: string): InlineToken[] {
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

function buildInlineElement(doc: Document, tag: string, children: InlineToken[]): HTMLElement {
	const el = doc.createElement(tag);
	for (const child of renderInline(doc, children)) el.appendChild(child);
	return el;
}

function buildLink(doc: Document, href: string, children: InlineToken[]): HTMLElement {
	const el = doc.createElement('a');
	el.className = 'sp-markdown__link';
	const safe = safeHref(href);
	if (safe !== null) {
		el.setAttribute('href', safe);
		el.setAttribute('rel', 'noopener noreferrer');
		el.setAttribute('target', '_blank');
	}
	for (const child of renderInline(doc, children)) el.appendChild(child);
	return el;
}

function renderInlineToken(doc: Document, tok: InlineToken): Node {
	switch (tok.type) {
		case 'text':
			return doc.createTextNode(tok.text);
		case 'bold':
			return buildInlineElement(doc, 'strong', tok.children);
		case 'italic':
			return buildInlineElement(doc, 'em', tok.children);
		case 'code': {
			const el = doc.createElement('code');
			el.className = 'sp-markdown__code';
			el.textContent = tok.text;
			return el;
		}
		case 'link':
			return buildLink(doc, tok.href, tok.children);
	}
}

/**
 * Renders a list of inline tokens into an array of DOM nodes (text or
 * element). Strings reach the DOM via `textContent` — never `innerHTML`.
 */
export function renderInline(doc: Document, tokens: InlineToken[]): Node[] {
	return tokens.map((tok) => renderInlineToken(doc, tok));
}

function renderParagraph(doc: Document, block: ParagraphBlock): HTMLElement {
	const el = doc.createElement('p');
	el.className = 'sp-markdown__p';
	for (const child of renderInline(doc, parseInline(block.text))) el.appendChild(child);
	return el;
}

function renderCode(doc: Document, block: CodeBlock): HTMLElement {
	const pre = doc.createElement('pre');
	pre.className = 'sp-markdown__pre';
	const code = doc.createElement('code');
	code.className = 'sp-markdown__pre-code';
	if (block.lang !== null) code.setAttribute('data-lang', block.lang);
	code.textContent = block.text;
	pre.appendChild(code);
	return pre;
}

function renderBlockquote(doc: Document, block: BlockquoteBlock): HTMLElement {
	const el = doc.createElement('blockquote');
	el.className = 'sp-markdown__blockquote';
	for (const child of renderInline(doc, parseInline(block.text))) el.appendChild(child);
	return el;
}

function renderList(doc: Document, block: ListBlock): HTMLElement {
	const list = doc.createElement(block.ordered ? 'ol' : 'ul');
	list.className = 'sp-markdown__list';
	for (const item of block.items) {
		const li = doc.createElement('li');
		li.className = 'sp-markdown__li';
		for (const child of renderInline(doc, parseInline(item))) li.appendChild(child);
		list.appendChild(li);
	}
	return list;
}

/**
 * Renders a single block into a DOM element. The caller appends the result
 * into its container.
 */
export function renderBlock(doc: Document, block: Block): HTMLElement {
	switch (block.type) {
		case 'paragraph':
			return renderParagraph(doc, block);
		case 'code':
			return renderCode(doc, block);
		case 'blockquote':
			return renderBlockquote(doc, block);
		case 'list':
			return renderList(doc, block);
	}
}

/**
 * Renders markdown `source` into a container by appending DOM nodes. Wraps
 * the block list in a single `<div class="sp-markdown">` so the caller can
 * detach the whole subtree on dispose.
 */
export function renderMarkdownInto(args: {
	source: string;
	container: HTMLElement;
}): () => void {
	const doc = args.container.ownerDocument;
	const wrapper = doc.createElement('div');
	wrapper.className = 'sp-markdown sp-markdown--fallback';
	const blocks = parseBlocks(args.source);
	for (const block of blocks) {
		wrapper.appendChild(renderBlock(doc, block));
	}
	args.container.appendChild(wrapper);
	return () => {
		wrapper.remove();
	};
}
