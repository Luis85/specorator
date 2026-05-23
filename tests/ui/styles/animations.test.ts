/**
 * Keyframes-presence test for the WS-AUX-1 animations layer (REQ-AUX-008,
 * REQ-AUX-019). Asserts that `src/ui/styles/animations.css` declares the
 * five named keyframes mandated by spec.md §1.3.6, §3.4, and §4.6:
 *   - thinking-pulse
 *   - streaming-cursor-blink
 *   - spin
 *   - mcp-glow
 *   - external-context-glow
 *
 * Plus an explicit `prefers-reduced-motion` override for `spin` (CQ-AUX-14).
 *
 * The test is a string-grep over the imported CSS file rather than a
 * mount-and-compute style assertion — jsdom does not animate, so behaviour
 * is verified at the source level.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ANIMATIONS_PATH = resolve(__dirname, '../../../src/ui/styles/animations.css');

const REQUIRED_KEYFRAMES = [
	'thinking-pulse',
	'streaming-cursor-blink',
	'spin',
	'mcp-glow',
	'external-context-glow',
];

function loadAnimations(): string {
	return readFileSync(ANIMATIONS_PATH, 'utf8');
}

describe('src/ui/styles/animations.css — keyframes contract (REQ-AUX-008, REQ-AUX-019)', () => {
	it('declares all five required @keyframes by name', () => {
		const css = loadAnimations();
		for (const name of REQUIRED_KEYFRAMES) {
			expect(css, `expected @keyframes ${name} declaration`).toMatch(
				new RegExp(`@keyframes\\s+${name}\\b`),
			);
		}
	});

	it('exposes an explicit prefers-reduced-motion override for spin (CQ-AUX-14)', () => {
		const css = loadAnimations();
		expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
		// Within the file the reduced-motion block must reference `spin` so the
		// indeterminate spinner does not animate when the user requests it.
		const blockMatch = /@media\s*\(prefers-reduced-motion:\s*reduce\)[^]*?\}\s*\}/.exec(css);
		expect(blockMatch, 'expected reduced-motion @media block').not.toBeNull();
		expect(blockMatch?.[0] ?? '').toMatch(/spin\b/);
	});
});
