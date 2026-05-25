import type { IconNode } from '@/domain/ports';

/**
 * Static `name → IconNode` map shared by `MockBridge` (`npm run dev`) and
 * `LocalStorageBridge` (GitHub Pages demo) — the synthetic, no-Obsidian backing
 * of `IconPort` (SPEC-RR-012). The Obsidian backing (`ObsidianBridge.setIcon`
 * walk) is the parity truth; this map need only be a recognisable placeholder
 * shape per name so the demo + dev render icons declaratively (NFR-RR-002).
 *
 * Each entry is a pure, declarative `IconNode` tree — `{ tag, attrs, children }`,
 * no DOM element and no HTML string (NFR-RR-006). Shapes mirror the lucide
 * 24×24 stroke style Obsidian uses; `attrs` are plain strings only.
 *
 * The icon-name set is the union of: the four status icons (`check`/`x`/
 * `shield-off`/`dot`), the generic fallback (`wrench`), and the real lucide tool
 * icons claudian's `getToolIcon` returns (`file-text`/`file-plus`/`file-pen`/
 * `terminal`/`folder-search`/`search`/`list`/`list-checks`/`globe`/`download`/
 * `bot`/`zap`/`help-circle`/`plug` — R-RR-003), and the P3 history-list action
 * icons (`chevron-up`/`pencil`/`trash-2` — R-TS-007). Unknown names resolve to `null`
 * (the caller substitutes a generic fallback — REQ-RR-019). These Mock/demo
 * shapes are recognisable placeholders only; the Obsidian backing is the parity
 * truth (SPEC-RR-012).
 */

/** Shared `<svg>` root attributes for a 24×24 lucide-style stroke icon. */
const SVG_ATTRS: Record<string, string> = {
	xmlns: 'http://www.w3.org/2000/svg',
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	'stroke-width': '2',
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
};

/** Build an `<svg>` `IconNode` from a list of child shape nodes. */
function svg(children: IconNode[]): IconNode {
	return { tag: 'svg', attrs: { ...SVG_ATTRS }, children };
}

function path(d: string): IconNode {
	return { tag: 'path', attrs: { d }, children: [] };
}

function polyline(points: string): IconNode {
	return { tag: 'polyline', attrs: { points }, children: [] };
}

function line(x1: string, y1: string, x2: string, y2: string): IconNode {
	return { tag: 'line', attrs: { x1, y1, x2, y2 }, children: [] };
}

function circle(cx: string, cy: string, r: string): IconNode {
	return { tag: 'circle', attrs: { cx, cy, r }, children: [] };
}

function rect(x: string, y: string, width: string, height: string, rx = '2'): IconNode {
	return { tag: 'rect', attrs: { x, y, width, height, rx }, children: [] };
}

/** Generic file outline shared by the file-* tool icons (placeholder shape). */
function fileBody(): IconNode[] {
	return [
		path('M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z'),
		polyline('14 2 14 8 20 8'),
	];
}

/**
 * The static icon map. Each shape is a deterministic, recognisable placeholder;
 * the Obsidian backing supplies the parity-faithful geometry (TEST-RR-026 M leg).
 * A `Map` (not a plain record) so `get` honestly returns `IconNode | undefined`.
 */
const ICON_NODE_MAP: ReadonlyMap<string, IconNode> = new Map<string, IconNode>([
	// ── status icons ───────────────────────────────────────────────────────────
	['check', svg([polyline('20 6 9 17 4 12')])],
	['x', svg([line('18', '6', '6', '18'), line('6', '6', '18', '18')])],
	[
		'shield-off',
		svg([
			path('M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18'),
			path('M4.73 4.73 4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38'),
			line('2', '2', '22', '22'),
		]),
	],
	['dot', svg([circle('12', '12', '1')])],
	// ── generic fallback ─────────────────────────────────────────────────────────
	[
		'wrench',
		svg([
			path(
				'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
			),
		]),
	],
	// ── tool icons ─────────────────────────────────────────────────────────────
	[
		'file',
		svg([
			path('M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z'),
			polyline('14 2 14 8 20 8'),
		]),
	],
	['terminal', svg([polyline('4 17 10 11 4 5'), line('12', '19', '20', '19')])],
	['search', svg([circle('11', '11', '8'), line('21', '21', '16.65', '16.65')])],
	[
		'bot',
		svg([
			path('M12 8V4H8'),
			path('M4 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z'),
			line('2', '14', '2', '14'),
			circle('8', '14', '1'),
			circle('16', '14', '1'),
		]),
	],
	// ── real lucide tool icons (claudian getToolIcon, R-RR-003) ──────────────────
	['file-text', svg([...fileBody(), line('9', '13', '15', '13'), line('9', '17', '13', '17')])],
	['file-plus', svg([...fileBody(), line('12', '11', '12', '17'), line('9', '14', '15', '14')])],
	['file-pen', svg([...fileBody(), path('M10.4 18.6 14 15l1.5 1.5-3.6 3.6H10.4v-1.5z')])],
	[
		'folder-search',
		svg([path('M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v3'), circle('15', '15', '3'), line('17.1', '17.1', '20', '20')]),
	],
	[
		'list',
		svg([line('8', '6', '21', '6'), line('8', '12', '21', '12'), line('8', '18', '21', '18'), line('3', '6', '3', '6'), line('3', '12', '3', '12'), line('3', '18', '3', '18')]),
	],
	[
		'list-checks',
		svg([path('M3 6 4 7 6 5'), line('10', '6', '21', '6'), path('M3 12 4 13 6 11'), line('10', '12', '21', '12'), line('10', '18', '21', '18'), line('3', '18', '4', '18')]),
	],
	[
		'globe',
		svg([circle('12', '12', '10'), line('2', '12', '22', '12'), path('M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z')]),
	],
	['download', svg([path('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'), polyline('7 10 12 15 17 10'), line('12', '15', '12', '3')])],
	['zap', svg([polyline('13 2 3 14 12 14 11 22 21 10 12 10 13 2')])],
	['help-circle', svg([circle('12', '12', '10'), path('M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'), line('12', '17', '12', '17')])],
	['plug', svg([rect('9', '2', '6', '8'), path('M7 10h10v3a5 5 0 0 1-10 0v-3z'), line('9', '2', '9', '5'), line('15', '2', '15', '5'), line('12', '18', '12', '22')])],
	// ── history-list action icons (P3 ResumeSessionDropdown, R-TS-007) ───────────
	['chevron-up', svg([polyline('18 15 12 9 6 15')])],
	['pencil', svg([path('M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z'), path('m15 5 4 4')])],
	[
		'trash-2',
		svg([
			polyline('3 6 5 6 21 6'),
			path('M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'),
			line('10', '11', '10', '17'),
			line('14', '11', '14', '17'),
		]),
	],
]);

/**
 * Resolve a logical icon name to a deep copy of its declarative `IconNode`, or
 * `null` when the name is unknown. The copy keeps the port pure/total (callers
 * cannot mutate the shared map). Used by `MockBridge`/`LocalStorageBridge`.
 */
export function lookupIconNode(name: string): IconNode | null {
	const node = ICON_NODE_MAP.get(name);
	return node === undefined ? null : cloneIconNode(node);
}

/** Structural deep copy of an `IconNode` (string attrs, recursive children). */
function cloneIconNode(node: IconNode): IconNode {
	return {
		tag: node.tag,
		attrs: { ...node.attrs },
		children: node.children.map(cloneIconNode),
	};
}
