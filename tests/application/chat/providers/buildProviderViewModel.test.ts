/**
 * T-PV-023 (RED) — the PURE `buildProviderViewModel` (SPEC-PV-015/029).
 *
 * Asserts the pure, total chooser + capability-gated widget view-model:
 *  - `options` maps the (already blank-tab-ordered) enabled descriptors to rows with
 *    `isActive` (`id === active`) + `isDefault` (`id === DEFAULT_CHAT_PROVIDER_ID`,
 *    TEST-PV-090);
 *  - `showChooser = enabled.length > 1` — a single-Claude registry → `false` → no
 *    chooser → byte-identical P8 (REQ-PV-006/114, EC-PV-1, TEST-PV-006);
 *  - `widgets` reads the ACTIVE capability bag field-for-field (TEST-PV-013/024/034/
 *    043/062/063/064) — a Codex bag → no rewind/commands/MCP; an Opencode bag → no
 *    rewind/fork/steer/MCP — with NO `switch (providerId)`;
 *  - pure + total — never throws.
 *
 * Traces: TEST-PV-006/013/024/034/043/062/063/064/090, SPEC-PV-015/029,
 * REQ-PV-002/006/013/024/034/043/062/063/064/090/114, NFR-PV-014, EC-PV-1/14/15.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildProviderViewModel } from '@/application/chat/providers/buildProviderViewModel';
import {
	CLAUDE_DESCRIPTOR,
	CODEX_DESCRIPTOR,
	OPENCODE_DESCRIPTOR,
	DEFAULT_CHAT_PROVIDER_ID,
} from '@/domain/chat/providers';

describe('buildProviderViewModel (T-PV-023)', () => {
	describe('options — chooser rows (TEST-PV-090)', () => {
		it('maps the enabled descriptors to rows with isActive + isDefault', () => {
			// Blank-tab order: opencode (10), codex (15), claude (20).
			const enabled = [OPENCODE_DESCRIPTOR, CODEX_DESCRIPTOR, CLAUDE_DESCRIPTOR];
			const vm = buildProviderViewModel(enabled, 'codex', CODEX_DESCRIPTOR.capabilities);

			expect(vm.options.map((o) => o.id)).toEqual(['opencode', 'codex', 'claude']);
			expect(vm.options.map((o) => o.displayNameKey)).toEqual([
				OPENCODE_DESCRIPTOR.displayNameKey,
				CODEX_DESCRIPTOR.displayNameKey,
				CLAUDE_DESCRIPTOR.displayNameKey,
			]);
			const codexRow = vm.options.find((o) => o.id === 'codex');
			expect(codexRow?.isActive).toBe(true);
			expect(vm.options.find((o) => o.id === 'opencode')?.isActive).toBe(false);
		});

		it('marks the Claude row as the default (id === DEFAULT_CHAT_PROVIDER_ID)', () => {
			const enabled = [CODEX_DESCRIPTOR, CLAUDE_DESCRIPTOR];
			const vm = buildProviderViewModel(enabled, 'claude', CLAUDE_DESCRIPTOR.capabilities);

			expect(vm.options.find((o) => o.id === DEFAULT_CHAT_PROVIDER_ID)?.isDefault).toBe(true);
			expect(vm.options.find((o) => o.id === 'codex')?.isDefault).toBe(false);
		});

		it('reports the active provider', () => {
			const vm = buildProviderViewModel(
				[CLAUDE_DESCRIPTOR, CODEX_DESCRIPTOR],
				'codex',
				CODEX_DESCRIPTOR.capabilities,
			);
			expect(vm.active).toBe('codex');
		});
	});

	describe('showChooser — the ≤1-enabled seam (TEST-PV-006, EC-PV-1)', () => {
		it('a single-Claude registry hides the chooser (byte-identical P8)', () => {
			const vm = buildProviderViewModel(
				[CLAUDE_DESCRIPTOR],
				'claude',
				CLAUDE_DESCRIPTOR.capabilities,
			);
			expect(vm.showChooser).toBe(false);
			expect(vm.options.map((o) => o.id)).toEqual(['claude']);
		});

		it('> 1 enabled shows the chooser', () => {
			const vm = buildProviderViewModel(
				[CODEX_DESCRIPTOR, CLAUDE_DESCRIPTOR],
				'claude',
				CLAUDE_DESCRIPTOR.capabilities,
			);
			expect(vm.showChooser).toBe(true);
		});

		it('an empty enabled list hides the chooser (total, never throws)', () => {
			const vm = buildProviderViewModel([], 'claude', CLAUDE_DESCRIPTOR.capabilities);
			expect(vm.showChooser).toBe(false);
			expect(vm.options).toEqual([]);
		});
	});

	describe('widgets — capability-gated from the active bag (TEST-PV-013/024/034/043/062/063/064)', () => {
		it('Claude — all toolbar affordances backed except turn-steer/service-tier', () => {
			const vm = buildProviderViewModel(
				[CLAUDE_DESCRIPTOR],
				'claude',
				CLAUDE_DESCRIPTOR.capabilities,
			);
			expect(vm.widgets.showRewind).toBe(true);
			expect(vm.widgets.showFork).toBe(true);
			expect(vm.widgets.showProviderCommands).toBe(true);
			expect(vm.widgets.showMcp).toBe(true);
			expect(vm.widgets.showTurnSteer).toBe(false);
			expect(vm.widgets.showServiceTier).toBe(false);
			expect(vm.widgets.reasoningControl).toBe('effort');
		});

		it('Codex — rewind/commands/MCP gated OFF, fork/turn-steer/service-tier backed (TEST-PV-034, EC-PV-14)', () => {
			const vm = buildProviderViewModel(
				[CLAUDE_DESCRIPTOR, CODEX_DESCRIPTOR],
				'codex',
				CODEX_DESCRIPTOR.capabilities,
			);
			expect(vm.widgets.showRewind).toBe(false);
			expect(vm.widgets.showProviderCommands).toBe(false);
			expect(vm.widgets.showMcp).toBe(false);
			expect(vm.widgets.showFork).toBe(true);
			expect(vm.widgets.showTurnSteer).toBe(true);
			expect(vm.widgets.showServiceTier).toBe(true);
		});

		it('Opencode — rewind/fork/steer/MCP gated OFF, provider-commands backed (TEST-PV-043, EC-PV-15)', () => {
			const vm = buildProviderViewModel(
				[CLAUDE_DESCRIPTOR, OPENCODE_DESCRIPTOR],
				'opencode',
				OPENCODE_DESCRIPTOR.capabilities,
			);
			expect(vm.widgets.showRewind).toBe(false);
			expect(vm.widgets.showFork).toBe(false);
			expect(vm.widgets.showTurnSteer).toBe(false);
			expect(vm.widgets.showMcp).toBe(false);
			expect(vm.widgets.showProviderCommands).toBe(true);
			expect(vm.widgets.showServiceTier).toBe(false);
		});

		it('reads the bag field-for-field (the widget flags equal the capability flags)', () => {
			const vm = buildProviderViewModel(
				[CODEX_DESCRIPTOR],
				'codex',
				CODEX_DESCRIPTOR.capabilities,
			);
			expect(vm.widgets.showRewind).toBe(CODEX_DESCRIPTOR.capabilities.supportsRewind);
			expect(vm.widgets.showFork).toBe(CODEX_DESCRIPTOR.capabilities.supportsFork);
			expect(vm.widgets.showTurnSteer).toBe(CODEX_DESCRIPTOR.capabilities.supportsTurnSteer);
			expect(vm.widgets.showProviderCommands).toBe(
				CODEX_DESCRIPTOR.capabilities.supportsProviderCommands,
			);
			expect(vm.widgets.showMcp).toBe(CODEX_DESCRIPTOR.capabilities.supportsMcpTools);
			expect(vm.widgets.reasoningControl).toBe(CODEX_DESCRIPTOR.capabilities.reasoningControl);
		});
	});

	describe('no switch(providerId) + total (NFR-PV-014, SPEC-PV-029)', () => {
		it('contains no switch(providerId) / per-id branch', () => {
			const source = readFileSync(
				resolve(__dirname, '../../../../src/application/chat/providers/buildProviderViewModel.ts'),
				'utf8',
			);
			expect(source).not.toMatch(/switch\s*\(\s*\w*[Pp]rovider/);
			expect(source).not.toMatch(/===\s*['"](?:claude|codex|opencode)['"]/);
		});

		it('never throws on any input', () => {
			expect(() =>
				buildProviderViewModel([], 'opencode', OPENCODE_DESCRIPTOR.capabilities),
			).not.toThrow();
		});
	});
});
