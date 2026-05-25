/**
 * T-CA-005 — RED: `SelectionHighlightPort` exposes
 * `show(target: EditorSelectionContext): void` + `clear(): void`;
 * `SELECTION_HIGHLIGHT_PORT` is its own InjectionKey; the barrel re-exports
 * the port.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CA-006 supplies the port.
 *
 * Traces: SPEC-CA-005, REQ-CA-014/015, ADR-CA-003 §1, NFR-CA-001.
 */
import { describe, it, expect } from 'vitest';
import type { SelectionHighlightPort } from '@/domain/ports';
import type { EditorSelectionContext } from '@/domain/chat/attachments';
import { SELECTION_HIGHLIGHT_PORT } from '@/infrastructure/bridge/ports';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const _show: Equals<
	SelectionHighlightPort['show'],
	(target: EditorSelectionContext) => void
> = true;
const _clear: Equals<SelectionHighlightPort['clear'], () => void> = true;
const _exact: Equals<keyof SelectionHighlightPort, 'show' | 'clear'> = true;
void _show;
void _clear;
void _exact;

describe('SelectionHighlightPort (TEST-CA-014/015 shape leg)', () => {
	it('a structural recording impl drives show/clear', () => {
		const shown: EditorSelectionContext[] = [];
		let cleared = 0;
		const port: SelectionHighlightPort = {
			show: (target) => {
				shown.push(target);
			},
			clear: () => {
				cleared += 1;
			},
		};
		port.show({
			kind: 'editor',
			notePath: 'a.md',
			selectedText: 'hi',
			startLine: 0,
			lineCount: 1,
		});
		port.clear();
		expect(shown).toHaveLength(1);
		expect(cleared).toBe(1);
	});

	it('exposes its own SELECTION_HIGHLIGHT_PORT InjectionKey', () => {
		expect(typeof SELECTION_HIGHLIGHT_PORT).toBe('symbol');
	});
});
