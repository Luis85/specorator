/**
 * T-AS-002 (TEST-AS-001 type-shape leg) — RED: `PermissionMode` is EXACTLY the
 * closed lower-case union `'normal' | 'plan' | 'yolo'`, exported from
 * `@/domain/chat/PermissionMode` and surfaced through the ports barrel
 * (`@/domain/ports`). The fixed three-mode set is the invariant (CLAR-AS-002) —
 * no fourth mode, `'normal'` is the default (absence ≡ `'normal'`).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-AS-003 adds `PermissionMode.ts`
 * + the barrel re-export.
 *
 * Traces: TEST-AS-001, SPEC-AS-001, REQ-AS-001, REQ-AS-004, REQ-AS-005,
 * NFR-AS-001.
 */
import { describe, it, expect } from 'vitest';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
// Surfaced through the ports barrel (SPEC-AS-006 barrel re-export).
import type { PermissionMode as PermissionModeFromBarrel } from '@/domain/ports';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- PermissionMode is EXACTLY the closed lower-case three-mode union ----
const _exact: Equals<PermissionMode, 'normal' | 'plan' | 'yolo'> = true;
void _exact;

// The barrel re-export is the same type as the own module.
const _barrelSame: Equals<PermissionMode, PermissionModeFromBarrel> = true;
void _barrelSame;

// Every member is assignable; no fourth member is.
const _normal: PermissionMode = 'normal';
const _plan: PermissionMode = 'plan';
const _yolo: PermissionMode = 'yolo';
void _normal;
void _plan;
void _yolo;

// @ts-expect-error — 'default' (the P6 display value) is NOT a PermissionMode.
const _notDefault: PermissionMode = 'default';
void _notDefault;
// @ts-expect-error — no fourth mode (the set is the invariant, CLAR-AS-002).
const _notBypass: PermissionMode = 'bypass';
void _notBypass;

describe('PermissionMode union (TEST-AS-001)', () => {
	it('enumerates exactly normal/plan/yolo', () => {
		const modes: PermissionMode[] = ['normal', 'plan', 'yolo'];
		expect(modes).toEqual(['normal', 'plan', 'yolo']);
		expect(modes).toHaveLength(3);
	});

	it("treats 'normal' as the default mode", () => {
		const fallback = (m: PermissionMode | undefined): PermissionMode => m ?? 'normal';
		expect(fallback(undefined)).toBe('normal');
		expect(fallback('yolo')).toBe('yolo');
	});
});
