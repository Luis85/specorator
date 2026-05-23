import type { Meta, StoryObj } from '@storybook/vue3-vite'
import SpIcon from '@/ui/components/primitives/SpIcon.vue'
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import type { IconPort, LoggerPort } from '@/domain/ports'

/**
 * Storybook coverage for `<SpIcon>` (REQ-AUX-017).
 *
 * The primitive depends on the IconPort + LoggerPort, neither of which the
 * Obsidian-flavoured theme stub provides. Stories register a deterministic
 * placeholder IconPort that mirrors the MockBridge contract (SVG with
 * `<title>{name}</title>`) so screenshots are stable and isolated from any
 * runtime. The missing-icon story uses a port that leaves the element
 * untouched so the textContent fallback is exercised.
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
		const title = document.createElementNS(svgNS, 'title')
		title.textContent = name
		svg.appendChild(title)
		el.appendChild(svg)
	},
}

const missingIconPort: IconPort = {
	setIcon: (_el, _name) => {
		// no-op — forces SpIcon into the textContent fallback path.
		void _el
		void _name
	},
}

/** Storybook does not need real log output — sink the calls into no-ops. */
const noop = (): void => {
	/* intentionally empty — stories do not assert log calls. */
}
const silentLogger: LoggerPort = {
	debug: noop,
	info: noop,
	warn: noop,
	error: noop,
}

const meta: Meta<typeof SpIcon> = {
	title: 'Primitives/SpIcon',
	component: SpIcon,
	args: { name: 'send', size: 16 },
	argTypes: {
		name: { control: 'text' },
		size: { control: { type: 'number', min: 8, max: 48, step: 1 } },
		ariaLabel: { control: 'text' },
	},
	render: (args) => ({
		components: { SpIcon },
		setup: () => ({ args }),
		template: '<SpIcon v-bind="args" />',
		provide: {
			[ICON_PORT as symbol]: placeholderIconPort,
			[LOGGER_PORT as symbol]: silentLogger,
		},
	}),
}
export default meta
type Story = StoryObj<typeof SpIcon>

export const Default: Story = {}

export const WithLabel: Story = {
	args: { name: 'send', ariaLabel: 'Send message' },
}

export const Sizes: Story = {
	render: () => ({
		components: { SpIcon },
		template: `
			<div style="display: flex; gap: 16px; align-items: center;">
				<SpIcon name="send" :size="12" />
				<SpIcon name="send" :size="16" />
				<SpIcon name="send" :size="24" />
				<SpIcon name="send" :size="32" />
			</div>
		`,
		provide: {
			[ICON_PORT as symbol]: placeholderIconPort,
			[LOGGER_PORT as symbol]: silentLogger,
		},
	}),
}

export const MissingIconFallback: Story = {
	args: { name: 'no-such-icon', ariaLabel: 'Fallback label' },
	render: (args) => ({
		components: { SpIcon },
		setup: () => ({ args }),
		template: '<SpIcon v-bind="args" />',
		provide: {
			// IconPort that never paints — exercises the textContent fallback
			// path (REQ-AUX-018).
			[ICON_PORT as symbol]: missingIconPort,
			[LOGGER_PORT as symbol]: silentLogger,
		},
	}),
}

