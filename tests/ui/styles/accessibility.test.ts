/**
 * Rule-group presence + CSS-discipline contract for the P12 accessibility layer
 * (SPEC-AY-001, SPEC-AY-011). Reads `src/ui/styles/accessibility.css` as text
 * (jsdom does not compute media queries / `:focus-visible`, so behaviour is
 * verified at the source level — the established `tokens.test.ts` /
 * `animations.test.ts` pattern, ADR-009).
 *
 * Covers:
 *   - TEST-AY-001  file exists + declares RG-1..RG-6; every selector `.specorator-root`-scoped.
 *   - TEST-AY-003  RG-1 reduced-motion guard (collapses animation/transition duration).
 *   - TEST-AY-004  RG-2 sets `animation: none` (not a duration) for spin under reduced-motion.
 *   - TEST-AY-005  RG-3 forced-colors mapping with `forced-color-adjust` + system colours.
 *   - TEST-AY-007  (file leg) RG-5 uses `:focus-visible` (no bare-`:focus` ring) + `--sp-focus-ring`.
 *   - TEST-AY-009  (file leg) RG-6 `.sr-only` clip technique (not `display:none`/`visibility:hidden`).
 *   - TEST-AY-015  (css leg) no hex / no raw Obsidian var outside `forced-colors`; ASCII-only comments.
 *
 * RED until T-AY-002 lands the file; GREEN once it does.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const A11Y_PATH = resolve(__dirname, '../../../src/ui/styles/accessibility.css');

function loadA11y(): string {
	return readFileSync(A11Y_PATH, 'utf8');
}

/** Strip `/* ... *\/` comment blocks so selector / property scans ignore prose. */
function stripComments(css: string): string {
	return css.replace(/\/\*[^]*?\*\//g, '');
}

/** Concatenate the bodies of every `@media (<query>) { ... }` block whose header matches. */
function mediaBlock(css: string, queryFragment: string): string {
	const stripped = stripComments(css);
	const headerRe = new RegExp(`@media[^{]*${queryFragment}[^{]*\\{`, 'gi');
	const bodies: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = headerRe.exec(stripped)) !== null) {
		// Walk braces from the header's opening `{` to its matching close.
		let depth = 0;
		let start = -1;
		for (let i = m.index; i < stripped.length; i++) {
			const ch = stripped[i];
			if (ch === '{') {
				if (depth === 0) start = i + 1;
				depth++;
			} else if (ch === '}') {
				depth--;
				if (depth === 0) {
					bodies.push(stripped.slice(start, i));
					headerRe.lastIndex = i + 1;
					break;
				}
			}
		}
	}
	return bodies.join('\n');
}

describe('src/ui/styles/accessibility.css — rule-group contract (SPEC-AY-001)', () => {
	it('TEST-AY-001: the file exists', () => {
		expect(() => loadA11y(), 'expected src/ui/styles/accessibility.css to exist').not.toThrow();
	});

	it('TEST-AY-001: declares all six rule groups RG-1..RG-6 in order', () => {
		const css = loadA11y();
		// Match each rule-group SECTION marker (`RG-N -` at the head of its comment),
		// not bare `RG-N` prose mentions elsewhere (e.g. the file header naming the set).
		let lastIdx = -1;
		for (let n = 1; n <= 6; n++) {
			const re = new RegExp(`RG-${n}\\s*-`);
			const idx = css.search(re);
			expect(idx, `expected rule-group section marker RG-${n} present`).toBeGreaterThanOrEqual(0);
			expect(
				idx,
				`expected RG-${n} section to appear after the previous group (in order)`,
			).toBeGreaterThan(lastIdx);
			lastIdx = idx;
		}
	});

	it('TEST-AY-001: every selector is `.specorator-root`-scoped (no rule escapes the subtree)', () => {
		const stripped = stripComments(loadA11y());
		// Collect the selector text preceding each `{`. Tokenise on `{` and `}` so the
		// segment after an opening brace (declarations) and at-rule headers (`@media`)
		// are dropped; every concrete style-rule selector must reference
		// `.specorator-root`.
		const offenders: string[] = [];
		const segments = stripped.split(/[{}]/);
		for (const raw of segments) {
			const sel = raw.trim();
			if (sel === '') continue;
			if (sel.startsWith('@')) continue; // at-rule header (@media …)
			if (sel.includes(':')) continue; // a declaration body (prop: value) or empty between braces
			if (!sel.includes('.specorator-root')) offenders.push(sel);
		}
		expect(offenders, `unscoped selectors: ${JSON.stringify(offenders)}`).toHaveLength(0);
	});
});

describe('src/ui/styles/accessibility.css — RG-1/RG-2 reduced motion (SPEC-AY-001, EC-AY-001/002)', () => {
	it('TEST-AY-003: RG-1 reduced-motion guard collapses animation + transition duration', () => {
		const block = mediaBlock(loadA11y(), 'prefers-reduced-motion:\\s*reduce');
		expect(block, 'expected a `prefers-reduced-motion: reduce` @media block').not.toBe('');
		expect(block).toMatch(/animation-duration:/);
		expect(block).toMatch(/transition-duration:/);
		expect(block, 'RG-1 guard uses !important').toMatch(/!important/);
	});

	it('TEST-AY-004: RG-2 sets `animation: none` (not a duration) for spin under reduced-motion', () => {
		const block = mediaBlock(loadA11y(), 'prefers-reduced-motion:\\s*reduce');
		// The spin halt must use `animation: none` — a near-zero duration alone does
		// not stop an indeterminate loop (CQ-AUX-14 / EC-AY-001).
		expect(block).toMatch(/\[data-animation="spin"\]|\.sp-spin/);
		expect(block, 'RG-2 must set `animation: none` for the spin halt').toMatch(
			/animation:\s*none\s*!important/,
		);
	});
});

describe('src/ui/styles/accessibility.css — RG-3 forced-colors mapping (SPEC-AY-001, REQ-AY-005)', () => {
	it('TEST-AY-005: RG-3 forced-colors block present with forced-color-adjust + system colours', () => {
		const block = mediaBlock(loadA11y(), 'forced-colors:\\s*active');
		expect(block, 'expected a `forced-colors: active` @media block').not.toBe('');
		expect(block).toMatch(/forced-color-adjust/);
		// Maps surface/text/focus/button affordances to CSS system colours.
		for (const kw of ['CanvasText', 'Canvas', 'Highlight', 'ButtonText', 'ButtonFace']) {
			expect(block, `expected system colour ${kw} in the forced-colors block`).toMatch(
				new RegExp(`\\b${kw}\\b`),
			);
		}
	});
});

describe('src/ui/styles/accessibility.css — RG-4 forced-colors borders (SPEC-AY-006, EC-AY-003)', () => {
	it('TEST-AY-006 (file leg): RG-4 enumerates the background-cue-only controls with a currentColor border', () => {
		const block = mediaBlock(loadA11y(), 'forced-colors:\\s*active');
		expect(block, 'expected a `forced-colors: active` @media block').not.toBe('');
		// Each enumerated control whose normal affordance is a background fill/wash.
		const controls = [
			'.sp-toggle-switch',
			'[data-state]',
			'.sp-chip',
			'.sp-tab',
			'[role="option"][aria-selected="true"]',
		];
		for (const sel of controls) {
			expect(block, `expected RG-4 to list ${sel}`).toContain(sel);
		}
		expect(block, 'RG-4 gives a visible border under forced-colors').toMatch(
			/border:\s*1px\s+solid\s+currentColor/,
		);
	});
});

describe('src/ui/styles/accessibility.css — RG-5 focus-visible ring (SPEC-AY-001, EC-AY-005/006/014)', () => {
	it('TEST-AY-007 (file leg): RG-5 uses `:focus-visible` and consumes var(--sp-focus-ring)', () => {
		const css = loadA11y();
		expect(css, 'RG-5 must key the ring off :focus-visible').toMatch(/:focus-visible/);
		expect(css, 'RG-5 must consume the existing --sp-focus-ring token').toMatch(
			/var\(--sp-focus-ring\)/,
		);
	});

	it('TEST-AY-007 (file leg): no bare-`:focus` ring rule (the mouse counter-metric, EC-AY-006)', () => {
		const stripped = stripComments(loadA11y());
		// A `:focus` not immediately followed by `-visible` would ring mouse focus.
		expect(stripped, 'a bare `:focus` ring would show on mouse click').not.toMatch(
			/:focus(?!-visible)/,
		);
	});
});

describe('src/ui/styles/accessibility.css — RG-6 .sr-only utility (SPEC-AY-001, EC-AY-007)', () => {
	it('TEST-AY-009 (file leg): `.sr-only` uses the clip technique, never display/visibility hiding', () => {
		const css = loadA11y();
		expect(css).toMatch(/\.sr-only/);
		expect(css, 'expected the clip technique').toMatch(/clip-path:\s*inset\(50%\)|clip:\s*rect/);
		expect(css).toMatch(/overflow:\s*hidden/);
		// Must not hide via display/visibility (removes from the accessibility tree).
		const block = (() => {
			const stripped = stripComments(css);
			const m = /\.sr-only[^{]*\{([^}]*)\}/.exec(stripped);
			return m ? m[1] : '';
		})();
		expect(block, `.sr-only body: ${block}`).not.toMatch(/display:\s*none/);
		expect(block).not.toMatch(/visibility:\s*hidden/);
	});
});

describe('src/ui/styles/accessibility.css — CSS discipline (SPEC-AY-011, NFR-AY-002/005)', () => {
	it('TEST-AY-015 (css leg): no hex literal outside the forced-colors block', () => {
		const css = loadA11y();
		const forcedBlock = mediaBlock(css, 'forced-colors:\\s*active');
		const outside = stripComments(css).replace(forcedBlock, '');
		expect(outside, 'no hex colour literal permitted outside forced-colors').not.toMatch(
			/#[0-9a-fA-F]{3,8}\b/,
		);
	});

	it('TEST-AY-015 (css leg): no raw Obsidian var outside the forced-colors block (only --sp-* / --interactive-accent via token)', () => {
		const css = loadA11y();
		const forcedBlock = mediaBlock(css, 'forced-colors:\\s*active');
		const outside = stripComments(css).replace(forcedBlock, '');
		const vars = outside.match(/var\(\s*(--[a-zA-Z0-9-]+)/g) ?? [];
		const offenders = vars
			.map((v) => v.replace(/var\(\s*/, ''))
			.filter((name) => !name.startsWith('--sp-'));
		expect(offenders, `raw non --sp-* vars outside forced-colors: ${JSON.stringify(offenders)}`).toHaveLength(
			0,
		);
	});

	it('TEST-AY-015 (css leg): comments are ASCII-only (lightningcss-safe, EC-AY-013)', () => {
		const css = loadA11y();
		// eslint-disable-next-line no-control-regex
		const nonAscii = css.match(/[^\x00-\x7F]/g);
		expect(nonAscii, `non-ASCII bytes found: ${JSON.stringify(nonAscii)}`).toBeNull();
	});
});
