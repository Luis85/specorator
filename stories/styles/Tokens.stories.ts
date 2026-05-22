/**
 * Tokens reference page (WS-AUX-1 / T-AUX-013).
 *
 * Visual baseline for the `--sp-*` design-token layer. Every token declared
 * in `src/ui/styles/tokens.css` (spec.md §4.1–§4.7) is rendered with its
 * resolved value so visual-regression sweeps can diff brand / spacing /
 * radii changes between provider attributes.
 *
 * REQ-AUX-017 (Storybook coverage).
 *
 * Note: spec.md §5.3 lists this file as `src/ui/styles/__stories__/Tokens.stories.ts`,
 * but the project's storybook config (`.storybook/main.ts`) only globs
 * `stories/**`. Keeping the story under `stories/styles/` to remain
 * discoverable; moving storybook globs is out of scope for WS-AUX-1.
 */
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';

import '@/ui/styles/tokens.css';
import '@/ui/styles/animations.css';

const COLOUR_TOKENS = [
	'--sp-text-normal',
	'--sp-text-muted',
	'--sp-text-faint',
	'--sp-bg-primary',
	'--sp-bg-primary-alt',
	'--sp-bg-secondary',
	'--sp-bg-secondary-alt',
	'--sp-border',
	'--sp-border-strong',
	'--sp-interactive-accent',
	'--sp-interactive-hover',
	'--sp-error',
	'--sp-warning',
	'--sp-success',
	'--sp-compact',
	'--sp-focus-ring',
];

const BRAND_TOKENS = [
	'--sp-brand',
	'--sp-brand-claude',
	'--sp-brand-codex',
	'--sp-brand-opencode',
	'--sp-brand-cursor',
	'--sp-brand-translucent',
	'--sp-accent',
];

const TYPOGRAPHY_TOKENS = [
	'--sp-font-text',
	'--sp-font-mono',
	'--sp-font-serif',
	'--sp-font-size-xs',
	'--sp-font-size-sm',
	'--sp-font-size-md',
	'--sp-font-size-base',
	'--sp-font-size-lg',
	'--sp-font-size-xl',
	'--sp-font-size-display',
	'--sp-font-weight-light',
	'--sp-font-weight-medium',
	'--sp-font-weight-semibold',
	'--sp-line-height-tight',
	'--sp-line-height-normal',
];

const SPACING_TOKENS = [
	'--sp-space-1',
	'--sp-space-2',
	'--sp-space-3',
	'--sp-space-4',
	'--sp-space-5',
	'--sp-space-6',
	'--sp-space-7',
];

const RADII_TOKENS = [
	'--sp-radius-xs',
	'--sp-radius-sm',
	'--sp-radius-md',
	'--sp-radius-lg',
	'--sp-radius-pill',
	'--sp-radius-pill-lg',
	'--sp-radius-pill-xl',
	'--sp-radius-full',
];

const MOTION_TOKENS = [
	'--sp-shadow-subtle',
	'--sp-shadow-dropup',
	'--sp-shadow-dropdown',
	'--sp-shadow-focus-ring',
	'--sp-blur',
	'--sp-duration-fast',
	'--sp-duration-medium',
	'--sp-duration-slow',
];

const PROVIDERS = ['claude', 'codex', 'opencode', 'cursor'] as const;

function tokenRow(name: string, swatch: 'color' | 'plain' = 'plain') {
	return h(
		'div',
		{
			style:
				'display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid var(--sp-border);font-family:var(--sp-font-mono);font-size:12px;',
		},
		[
			swatch === 'color'
				? h('span', {
						style:
							`display:inline-block;width:24px;height:24px;border-radius:4px;border:1px solid var(--sp-border);background:var(${name});`,
					})
				: null,
			h('span', { style: 'min-width:240px;color:var(--sp-text-normal);' }, name),
			h('span', { style: 'color:var(--sp-text-muted);' }, `var(${name})`),
		],
	);
}

function section(title: string, children: ReturnType<typeof h>[]) {
	return h('section', { style: 'margin:24px 0;' }, [
		h(
			'h3',
			{
				style:
					'margin:0 0 12px;font-family:var(--sp-font-text);font-weight:600;color:var(--sp-text-normal);',
			},
			title,
		),
		h('div', null, children),
	]);
}

const TokensPage = defineComponent({
	name: 'TokensPage',
	props: {
		provider: { type: String, default: '' },
	},
	render() {
		const providerAttr = this.provider === '' ? undefined : this.provider;
		return h(
			'div',
			{
				class: 'specorator-root',
				'data-provider': providerAttr,
				style:
					'padding:24px;background:var(--sp-bg-primary);color:var(--sp-text-normal);font-family:var(--sp-font-text);min-height:600px;',
			},
			[
				h('h2', { style: 'margin:0 0 8px;' }, '--sp-* design tokens'),
				h(
					'p',
					{ style: 'color:var(--sp-text-muted);margin:0 0 16px;' },
					'Baseline reference for the WS-AUX-1 token layer. Toggle the provider control to verify brand swap.',
				),
				section(
					'Colour',
					COLOUR_TOKENS.map((t) => tokenRow(t, 'color')),
				),
				section(
					'Brand',
					BRAND_TOKENS.map((t) => tokenRow(t, 'color')),
				),
				section(
					'Typography',
					TYPOGRAPHY_TOKENS.map((t) => tokenRow(t, 'plain')),
				),
				section(
					'Spacing',
					SPACING_TOKENS.map((t) => tokenRow(t, 'plain')),
				),
				section(
					'Radii',
					RADII_TOKENS.map((t) => tokenRow(t, 'plain')),
				),
				section(
					'Shadows + motion',
					MOTION_TOKENS.map((t) => tokenRow(t, 'plain')),
				),
			],
		);
	},
});

const meta: Meta<typeof TokensPage> = {
	title: 'Styles/Tokens',
	component: TokensPage,
	args: { provider: '' },
	argTypes: {
		provider: {
			control: 'select',
			options: ['', ...PROVIDERS],
			description: '[data-provider] attribute on .specorator-root',
		},
	},
};
export default meta;
type Story = StoryObj<typeof TokensPage>;

export const Default: Story = { args: { provider: '' } };
export const Claude: Story = { args: { provider: 'claude' } };
export const Codex: Story = { args: { provider: 'codex' } };
export const Opencode: Story = { args: { provider: 'opencode' } };
export const Cursor: Story = { args: { provider: 'cursor' } };
