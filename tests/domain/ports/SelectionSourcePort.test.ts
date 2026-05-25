/**
 * T-CA-005 — RED: `SelectionSourcePort` exposes
 * `getCurrentSelection() -> CapturedSelection | null`,
 * `onSelectionChange(listener) -> Unsubscriber`, and a readonly
 * `supportsBrowserSelection: boolean`; `SELECTION_SOURCE_PORT` is its own
 * InjectionKey; the barrel re-exports the port.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CA-006 supplies the port.
 *
 * Traces: SPEC-CA-005, REQ-CA-013..019, ADR-CA-003 §1, NFR-CA-001.
 */
import { describe, it, expect } from 'vitest';
import type { SelectionSourcePort, Unsubscriber } from '@/domain/ports';
import type { CapturedSelection } from '@/domain/chat/attachments';
import { SELECTION_SOURCE_PORT } from '@/infrastructure/bridge/ports';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const _get: Equals<
	SelectionSourcePort['getCurrentSelection'],
	() => CapturedSelection | null
> = true;
const _on: Equals<
	SelectionSourcePort['onSelectionChange'],
	(listener: (sel: CapturedSelection | null) => void) => Unsubscriber
> = true;
const _supports: Equals<SelectionSourcePort['supportsBrowserSelection'], boolean> = true;
const _exact: Equals<
	keyof SelectionSourcePort,
	'getCurrentSelection' | 'onSelectionChange' | 'supportsBrowserSelection'
> = true;
void _get;
void _on;
void _supports;
void _exact;

describe('SelectionSourcePort (TEST-CA-013 shape leg)', () => {
	it('a structural inert impl reads null + never-firing subscription', () => {
		const calls: (CapturedSelection | null)[] = [];
		const port: SelectionSourcePort = {
			getCurrentSelection: () => null,
			onSelectionChange: (listener) => {
				void listener;
				return () => {};
			},
			supportsBrowserSelection: false,
		};
		expect(port.getCurrentSelection()).toBeNull();
		expect(port.supportsBrowserSelection).toBe(false);
		const unsub: Unsubscriber = port.onSelectionChange((sel) => calls.push(sel));
		unsub();
		expect(calls).toHaveLength(0);
	});

	it('exposes its own SELECTION_SOURCE_PORT InjectionKey', () => {
		expect(typeof SELECTION_SOURCE_PORT).toBe('symbol');
	});
});
