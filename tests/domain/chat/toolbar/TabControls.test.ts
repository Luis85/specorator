/**
 * T-TC-002 (TEST-TC-006 type-shape leg) — RED: `TabControls` is EXACTLY the four
 * optional members `model?:string` / `mode?:string` / `reasoning?:ReasoningChoice`
 * / `serviceTier?:string`, re-exported from `@/domain/chat/toolbar/index`.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-TC-004 adds `TabControls.ts`.
 *
 * Traces: TEST-TC-006, SPEC-TC-006, REQ-TC-012, REQ-TC-014, REQ-TC-018,
 * REQ-TC-020, REQ-TC-042.
 */
import { describe, it, expect } from 'vitest';
import type { TabControls } from '@/domain/chat/toolbar';
import type { ReasoningChoice } from '@/domain/chat/Reasoning';
import type { PermissionMode } from '@/domain/chat/PermissionMode';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- TabControls is EXACTLY the four P6 optional members + the P7 permissionMode? ----
// T-AS-002 (TEST-AS-002 type-shape leg, SPEC-AS-002): `permissionMode?` is appended
// AFTER `serviceTier`; the four P6 members stay byte-identical.
const _keys: Equals<
	keyof TabControls,
	'model' | 'mode' | 'reasoning' | 'serviceTier' | 'permissionMode'
> = true;
const _model: Equals<TabControls['model'], string | undefined> = true;
const _mode: Equals<TabControls['mode'], string | undefined> = true;
const _reasoning: Equals<TabControls['reasoning'], ReasoningChoice | undefined> = true;
const _serviceTier: Equals<TabControls['serviceTier'], string | undefined> = true;
const _permissionMode: Equals<TabControls['permissionMode'], PermissionMode | undefined> = true;
void _keys;
void _model;
void _mode;
void _reasoning;
void _serviceTier;
void _permissionMode;

describe('TabControls bag (TEST-TC-006)', () => {
	it('constructs an empty (untouched) control bag', () => {
		const controls: TabControls = {};
		expect(Object.keys(controls)).toEqual([]);
	});

	it('constructs a fully-populated control bag', () => {
		const controls: TabControls = {
			model: 'opus',
			mode: 'acceptEdits',
			reasoning: { kind: 'effort', value: 'high' },
			serviceTier: 'priority',
			permissionMode: 'yolo',
		};
		expect(controls.model).toBe('opus');
		expect(controls.reasoning?.kind).toBe('effort');
		expect(controls.permissionMode).toBe('yolo');
	});
});
