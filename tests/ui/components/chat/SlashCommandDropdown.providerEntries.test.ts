/**
 * T-MPS-114 — Slash-command dropdown is enriched with provider-contributed
 * entries from `ProviderRegistry.getProvider(active).slashCommands()`.
 *
 * Satisfies REQ-MPS-034.
 *
 * The dropdown is presentational; the enrichment happens in `useSlashPalette`,
 * which now optionally consumes a provider entry's `slashCommands()` and
 * concatenates them with the built-ins (and any vault-sourced entries).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { SlashCommand } from '@/domain/chat/SlashCommand';
import type { ProviderEntry } from '@/domain/chat/ProviderRegistry';
import { useSlashPalette } from '@/ui/composables/useSlashPalette';

const PROVIDER_CMD: SlashCommand = Object.freeze({
	name: 'context',
	description: 'Show context usage',
	kind: 'builtin',
	action: 'help',
});

const providerEntry: ProviderEntry = {
	id: 'claude',
	label: 'Claude',
	capabilities: {
		modes: ['api', 'cli'],
		models: [],
		supportsStreaming: true,
		supportsTools: true,
		supportsThinking: true,
		supportsPlanMode: true,
		supportsAttachments: ['image', 'file'],
		supportsSessionResume: true,
		modeDisabledReason: { api: null, cli: null },
	},
	slashCommands: () => [PROVIDER_CMD],
};

describe('useSlashPalette — provider-contributed slash commands (REQ-MPS-034)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-034: provider slash commands appear in the matched list', () => {
		const palette = useSlashPalette({
			commands: [],
			providerEntry,
		});
		palette.open('');
		expect(palette.commands.value.some((c) => c.name === 'context')).toBe(true);
		expect(palette.matchedCommands.value.some((c) => c.name === 'context')).toBe(true);
	});

	it('REQ-MPS-034: filtering applies to provider commands too', () => {
		const palette = useSlashPalette({
			commands: [],
			providerEntry,
		});
		palette.open('cont');
		const names = palette.matchedCommands.value.map((c) => c.name);
		expect(names).toContain('context');
	});
});
