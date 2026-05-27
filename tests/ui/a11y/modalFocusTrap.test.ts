/**
 * T-AY-013 (verify-only) — modal focus trap + restore via the platform (the 8
 * Specorator modal seams). SPEC-AY-009, REQ-AY-012/013, NFR-AY-001,
 * EC-AY-008/009.
 *
 * Every Specorator modal extends Obsidian `Modal`, which NATIVELY traps
 * Tab/Shift+Tab within `.modal` and restores `document.activeElement` on close
 * (D-AY-3). The spec requires each launcher to open a `Modal` subclass; this is
 * the structural assertion that property holds (the live Tab-cycle + focus
 * restore are the human TEST-AY-017 leg / the Obsidian runtime, which the JSDOM
 * harness cannot exercise). Do NOT hand-roll a trap.
 *
 * DEFECT-ESCALATION NOTE: a modal found NOT to extend `Modal` is a defect — file
 * ADR-AY-001 + a new hand-rolled-trap task (the P5-P11 way), never a silent
 * default. As verified below, all 8 extend `Modal`, so that does not arise.
 *
 * Traces: TEST-AY-012, TEST-AY-013, SPEC-AY-009, REQ-AY-012/013, EC-AY-008/009.
 */
import { describe, it, expect } from 'vitest';
import { Modal } from 'obsidian';
import { ProviderConsentModal } from '@/plugin/modals/ProviderConsentModal';
import { DeleteConfirmModal } from '@/plugin/modals/DeleteConfirmModal';
import { ForkTargetModal } from '@/plugin/modals/ForkTargetModal';
import { InstructionConfirmModal } from '@/plugin/modals/InstructionConfirmModal';
import { InlineEditModal } from '@/plugin/modals/InlineEditModal';
import { ImagePreviewModal } from '@/plugin/modals/ImagePreviewModal';
import { McpServerModalHost } from '@/plugin/modals/McpServerModalHost';
import { McpTestModalHost } from '@/plugin/modals/McpTestModalHost';

/** The 8 Specorator modal seams (DESIGN-AY-001 B.2). */
const MODALS = [
	['ProviderConsentModal', ProviderConsentModal],
	['DeleteConfirmModal', DeleteConfirmModal],
	['ForkTargetModal', ForkTargetModal],
	['InstructionConfirmModal', InstructionConfirmModal],
	['InlineEditModal', InlineEditModal],
	['ImagePreviewModal', ImagePreviewModal],
	['McpServerModalHost', McpServerModalHost],
	['McpTestModalHost', McpTestModalHost],
] as const;

describe('modal focus trap + restore (TEST-AY-012/013, verify-only)', () => {
	it('all 8 modal seams extend Obsidian Modal (native trap + restore, EC-AY-008/009)', () => {
		for (const [name, ctor] of MODALS) {
			expect(ctor.prototype instanceof Modal, `${name} must extend Obsidian Modal`).toBe(true);
		}
	});

	it('each modal class is in the Modal prototype chain (no hand-rolled trap)', () => {
		for (const [name, ctor] of MODALS) {
			// Walk the prototype chain to Modal — the native trap/restore source.
			let proto: unknown = Object.getPrototypeOf(ctor.prototype);
			let found = false;
			while (proto !== null) {
				if (proto === Modal.prototype) {
					found = true;
					break;
				}
				proto = Object.getPrototypeOf(proto);
			}
			expect(found, `${name} must inherit Modal.prototype`).toBe(true);
		}
	});
});
