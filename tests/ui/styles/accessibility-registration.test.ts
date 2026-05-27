/**
 * CSS-pipeline registration contract for the P12 accessibility layer
 * (SPEC-AY-002, SPEC-AY-003, NFR-AY-006). Reads the two entry files as text and
 * asserts each imports `accessibility.css` as the 3rd CSS import — positioned
 * AFTER the tokens + animations imports (the ordering contract).
 *
 * TEST-AY-002. RED until T-AY-002 adds the two import lines; GREEN once both land.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const PLUGIN_MAIN = resolve(__dirname, '../../../src/plugin/main.ts');
const UI_MAIN = resolve(__dirname, '../../../src/ui/main.ts');

function lineIndexMatching(source: string, re: RegExp): number {
	const lines = source.split(/\r?\n/);
	return lines.findIndex((l) => re.test(l));
}

describe('accessibility.css registration (SPEC-AY-002/003, NFR-AY-006)', () => {
	it('TEST-AY-002: src/plugin/main.ts imports accessibility.css after tokens + animations', () => {
		const src = readFileSync(PLUGIN_MAIN, 'utf8');
		const tokens = lineIndexMatching(src, /import\s+['"]@\/ui\/styles\/tokens\.css['"]/);
		const animations = lineIndexMatching(src, /import\s+['"]@\/ui\/styles\/animations\.css['"]/);
		const a11y = lineIndexMatching(src, /import\s+['"]@\/ui\/styles\/accessibility\.css['"]/);

		expect(tokens, 'tokens.css import present').toBeGreaterThanOrEqual(0);
		expect(animations, 'animations.css import present').toBeGreaterThanOrEqual(0);
		expect(a11y, 'accessibility.css import present in plugin entry').toBeGreaterThanOrEqual(0);
		expect(a11y, 'accessibility.css must come after animations.css').toBeGreaterThan(animations);
		expect(animations, 'animations.css must come after tokens.css').toBeGreaterThan(tokens);
	});

	it('TEST-AY-002: src/ui/main.ts imports accessibility.css after tokens + animations', () => {
		const src = readFileSync(UI_MAIN, 'utf8');
		const tokens = lineIndexMatching(src, /import\s+['"]\.\/styles\/tokens\.css['"]/);
		const animations = lineIndexMatching(src, /import\s+['"]\.\/styles\/animations\.css['"]/);
		const a11y = lineIndexMatching(src, /import\s+['"]\.\/styles\/accessibility\.css['"]/);

		expect(tokens, 'tokens.css import present').toBeGreaterThanOrEqual(0);
		expect(animations, 'animations.css import present').toBeGreaterThanOrEqual(0);
		expect(a11y, 'accessibility.css import present in standalone entry').toBeGreaterThanOrEqual(0);
		expect(a11y, 'accessibility.css must come after animations.css').toBeGreaterThan(animations);
		expect(animations, 'animations.css must come after tokens.css').toBeGreaterThan(tokens);
	});
});
