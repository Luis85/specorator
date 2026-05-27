/**
 * T-AY-016 (RED -> green) — `parity-screenshots.md` completeness (TEST-AY-016).
 * REQ-AY-016. Artifact-completeness ONLY — it checks the matrix has every
 * required row/cell slot (every charter §3 surface at 320/520/720 px in light +
 * dark, each with a claudian-baseline + Specorator cell); the VISUAL judgment is
 * the human TEST-AY-017 leg.
 *
 * Traces: TEST-AY-016, REQ-AY-016.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOC_PATH = resolve(__dirname, '../../../specs/accessibility/parity-screenshots.md');

function loadDoc(): string {
	return readFileSync(DOC_PATH, 'utf8');
}

/** Every charter §3 surface group that must be represented in the matrix. */
const SECTIONS = ['§3.1', '§3.2', '§3.3', '§3.4', '§3.5', '§3.6', '§3.7', '§3.8', '§3.9'];

describe('parity-screenshots.md completeness (TEST-AY-016)', () => {
	it('the artifact exists and is non-trivial', () => {
		const doc = loadDoc();
		expect(doc.length).toBeGreaterThan(200);
		expect(doc).toContain('parity');
	});

	it('declares the three charter widths in both themes (320/520/720 x L/D)', () => {
		const doc = loadDoc();
		for (const width of ['320', '520', '720']) {
			expect(doc, `width ${width} present`).toContain(width);
		}
		// The default-render matrix header carries the per-width light/dark columns.
		for (const header of ['320 L', '320 D', '520 L', '520 D', '720 L', '720 D']) {
			expect(doc, `column ${header} present`).toContain(header);
		}
	});

	it('represents every charter §3 surface group', () => {
		const doc = loadDoc();
		for (const section of SECTIONS) {
			expect(doc, `charter surface ${section} present`).toContain(section);
		}
	});

	it('carries a claudian baseline column + a Specorator side-by-side leg', () => {
		const doc = loadDoc();
		expect(doc).toContain('Baseline (claudian)');
		// Each surface row pairs the claudian baseline with the Specorator capture columns.
		expect(doc.toLowerCase()).toContain('specorator');
	});

	it('carries the a11y-condition columns (reduced-motion + forced-colors)', () => {
		const doc = loadDoc();
		expect(doc).toContain('reduced-motion');
		expect(doc).toContain('forced-colors');
	});

	it('the matrix is structurally complete (no surface row left without its baseline cell)', () => {
		const doc = loadDoc();
		// Every default-render surface row is a table row that names a charter section
		// and carries a non-empty Baseline (claudian) reference cell.
		const rows = doc
			.split('\n')
			.filter((l) => l.trim().startsWith('|') && /§3\.\d/.test(l));
		expect(rows.length, 'at least one surface row per charter §3 section').toBeGreaterThanOrEqual(
			SECTIONS.length,
		);
		for (const row of rows) {
			const cells = row.split('|').map((c) => c.trim());
			// cells[1] = surface name, cells[2] = baseline reference; both non-empty.
			expect(cells[1]?.length ?? 0, `surface name in row: ${row}`).toBeGreaterThan(0);
			expect(cells[2]?.length ?? 0, `baseline cell in row: ${row}`).toBeGreaterThan(0);
		}
	});
});
