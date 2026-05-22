import type { Meta, StoryObj } from '@storybook/vue3-vite'
import SpIconButton from '@/ui/components/primitives/SpIconButton.vue'
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import type { IconPort, LoggerPort } from '@/domain/ports'

/**
 * Storybook coverage for `<SpIconButton>` (REQ-AUX-017, spec §1.3.12).
 *
 * Provides a deterministic IconPort placeholder so the inner `<SpIcon>` paints
 * an svg in screenshots without relying on Obsidian or Lucide at runtime.
 */
const placeholderIconPort: IconPort = {
	setIcon(el, name) {
		while (el.firstChild) el.removeChild(el.firstChild)
		const svgNS = 'http://www.w3.org/2000/svg'
		const svg = document.createElementNS(svgNS, 'svg')
		svg.setAttribute('data-icon', name)
		svg.setAttribute('aria-hidden', 'true')
		svg.setAttribute('viewBox', '0 0 24 24')
		svg.setAttribute('fill', 'none')
		svg.setAttribute('stroke', 'currentColor')
		svg.setAttribute('stroke-width', '2')
		const circle = document.createElementNS(svgNS, 'circle')
		circle.setAttribute('cx', '12')
		circle.setAttribute('cy', '12')
		circle.setAttribute('r', '9')
		svg.appendChild(circle)
		el.appendChild(svg)
	},
}

const noop = (): void => {
	/* intentionally empty */
}
const silentLogger: LoggerPort = { debug: noop, info: noop, warn: noop, error: noop }

const provide = {
	[ICON_PORT as symbol]: placeholderIconPort,
	[LOGGER_PORT as symbol]: silentLogger,
}

const meta: Meta<typeof SpIconButton> = {
	title: 'Primitives/SpIconButton',
	component: SpIconButton,
	args: { icon: 'send', ariaLabel: 'Send', variant: 'ghost', size: 16 },
	argTypes: {
		icon: { control: 'text' },
		ariaLabel: { control: 'text' },
		variant: { control: { type: 'select' }, options: ['primary', 'secondary', 'ghost'] },
		size: { control: { type: 'number', min: 12, max: 32 } },
		disabled: { control: 'boolean' },
		loading: { control: 'boolean' },
	},
	render: (args) => ({
		components: { SpIconButton },
		setup: () => ({ args }),
		template: '<SpIconButton v-bind="args" />',
		provide,
	}),
}
export default meta
type Story = StoryObj<typeof SpIconButton>

export const Default: Story = {}
export const Primary: Story = { args: { variant: 'primary' } }
export const Secondary: Story = { args: { variant: 'secondary' } }
export const Disabled: Story = { args: { disabled: true } }
export const Loading: Story = { args: { loading: true } }

export const Sizes: Story = {
	render: () => ({
		components: { SpIconButton },
		template: `
			<div style="display: flex; gap: 8px; align-items: center;">
				<SpIconButton icon="send" ariaLabel="Send small" :size="14" />
				<SpIconButton icon="send" ariaLabel="Send medium" :size="16" />
				<SpIconButton icon="send" ariaLabel="Send large" :size="20" />
				<SpIconButton icon="send" ariaLabel="Send xl" :size="24" />
			</div>
		`,
		provide,
	}),
}
