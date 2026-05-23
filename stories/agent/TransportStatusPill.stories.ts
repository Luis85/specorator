import type { Meta, StoryObj } from '@storybook/vue3-vite';

import TransportStatusPill from '@/ui/components/agent/TransportStatusPill.vue';

/**
 * Storybook coverage for `<TransportStatusPill>` (REQ-AUX-016 / REQ-AUX-017).
 * One story per kind so the per-kind colour + icon mapping is reviewable
 * without running the full sidepanel.
 */
const meta: Meta<typeof TransportStatusPill> = {
	title: 'Agent/TransportStatusPill',
	component: TransportStatusPill,
};
export default meta;
type Story = StoryObj<typeof TransportStatusPill>;

export const Connecting: Story = {
	render: () => ({
		components: { TransportStatusPill },
		template: `
			<div class="specorator-root" style="padding: 16px;">
				<TransportStatusPill kind="connecting" providerLabel="Claude · CLI" />
			</div>
		`,
	}),
};

export const Degraded: Story = {
	render: () => ({
		components: { TransportStatusPill },
		template: `
			<div class="specorator-root" style="padding: 16px;">
				<TransportStatusPill kind="degraded" providerLabel="Claude · CLI" />
			</div>
		`,
	}),
};

export const Offline: Story = {
	render: () => ({
		components: { TransportStatusPill },
		template: `
			<div class="specorator-root" style="padding: 16px;">
				<TransportStatusPill kind="offline" providerLabel="Codex · API" />
			</div>
		`,
	}),
};

export const WithDiagnostic: Story = {
	render: () => ({
		components: { TransportStatusPill },
		template: `
			<div class="specorator-root" style="padding: 16px;">
				<TransportStatusPill
					kind="offline"
					providerLabel="Cursor · CLI"
					diagnostic="ECONNREFUSED"
				/>
			</div>
		`,
	}),
};
