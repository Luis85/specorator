/**
 * T-MHP-141 — SpecoratorStatusBar (status-bar badge) tests.
 *
 * NOTE on task-ID vs path mapping: the user's task brief for T-MHP-141 names
 * the StatusBarBadge tests at this path. The tasks.md entry for T-MHP-141
 * itself is the `kind` discriminator forward-compat test; the status-bar
 * badge tests are tracked there as T-MHP-090. Per the user's explicit
 * routing, this file covers the StatusBar contract per SPEC-MHP-041 +
 * REQ-MHP-046. Flagged in the qa hand-off note.
 *
 * Satisfies: REQ-MHP-046 (pending-proposal surfacing — status-bar item);
 *            SPEC-MHP-041; TEST-MHP-049, TEST-MHP-054;
 *            EC-MHP-034, EC-MHP-035, EC-MHP-037; RISK-MHP-012.
 *
 * Contract under test:
 *   - badge increments on `proposalEnqueued` with status: 'pending'
 *   - badge decrements on `proposalDecided`
 *   - status-bar element is REMOVED from the DOM (not display: none) at N=0
 *   - text format is `MCP: <N> pending`
 *   - aria-live="polite"
 *   - `dispose()` unsubscribes from EventBus before releasing DOM
 *   - 100+ N renders as the absolute integer (no "99+" truncation)
 *
 * The plugin's `Plugin.addStatusBarItem` is mocked by returning a real
 * HTMLDivElement appended to a host container — letting us assert on
 * presence-in-DOM and on text content directly.
 *
 * This test MUST fail before T-MHP-091 ships
 * `src/plugin/SpecoratorStatusBar.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEventBus } from '@/domain/shared/event-bus'
import { fakeModulePorts } from '../__fakes__/fake-ports'

import { SpecoratorStatusBar } from '@/plugin/SpecoratorStatusBar'

interface ProposalEnqueuedPayload {
	proposalId: string
	tool: string
	status: 'pending' | 'accepted'
	client: { id: string }
}
interface ProposalDecidedPayload {
	proposalId: string
}

interface PluginLike {
	addStatusBarItem(): HTMLElement
}

function makeFakePlugin(host: HTMLElement): PluginLike {
	return {
		addStatusBarItem(): HTMLElement {
			const el = document.createElement('div')
			host.appendChild(el)
			return el
		},
	}
}

function enqueue(
	bus: ReturnType<typeof createEventBus>,
	proposalId: string,
	status: 'pending' | 'accepted' = 'pending',
): void {
	const payload: ProposalEnqueuedPayload = {
		proposalId,
		tool: 'vault_write_note',
		status,
		client: { id: 'cursor' },
	}
	// `proposalEnqueued` is a feature-private channel; cast to string keeps the
	// generic EventBus type happy while we exercise the contract.
	bus.emit('proposalEnqueued' as never, payload as never)
}

function decide(bus: ReturnType<typeof createEventBus>, proposalId: string): void {
	const payload: ProposalDecidedPayload = { proposalId }
	bus.emit('proposalDecided' as never, payload as never)
}

describe('T-MHP-141 — SpecoratorStatusBar (SPEC-MHP-041, REQ-MHP-046)', () => {
	let host: HTMLElement

	beforeEach(() => {
		while (document.body.firstChild) document.body.removeChild(document.body.firstChild)
		host = document.createElement('div')
		host.setAttribute('data-testid', 'status-bar-host')
		document.body.appendChild(host)
	})

	it('is absent from the DOM when pending count is 0 (EC-MHP-035)', () => {
		const ports = fakeModulePorts()
		const bus = createEventBus()
		const plugin = makeFakePlugin(host)
		const badge = new SpecoratorStatusBar({ plugin, bus, ports })
		badge.mount()
		// No events emitted ⇒ no status-bar element.
		expect(host.querySelector('[data-testid="mcp-status-bar"]')).toBeNull()
	})

	it('increments to 1 on first pending event (EC-MHP-034)', () => {
		const ports = fakeModulePorts()
		const bus = createEventBus()
		const plugin = makeFakePlugin(host)
		const badge = new SpecoratorStatusBar({ plugin, bus, ports })
		badge.mount()

		enqueue(bus, 'p1', 'pending')
		const el = host.querySelector('[data-testid="mcp-status-bar"]')
		expect(el).not.toBeNull()
		expect(el?.textContent).toContain('MCP: 1 pending')
	})

	it('renders `MCP: 3 pending` after three pending events', () => {
		const ports = fakeModulePorts()
		const bus = createEventBus()
		const plugin = makeFakePlugin(host)
		const badge = new SpecoratorStatusBar({ plugin, bus, ports })
		badge.mount()
		enqueue(bus, 'p1', 'pending')
		enqueue(bus, 'p2', 'pending')
		enqueue(bus, 'p3', 'pending')
		const el = host.querySelector('[data-testid="mcp-status-bar"]')
		expect(el?.textContent).toContain('MCP: 3 pending')
	})

	it('does not increment for accepted (auto-accept) events', () => {
		const ports = fakeModulePorts()
		const bus = createEventBus()
		const plugin = makeFakePlugin(host)
		const badge = new SpecoratorStatusBar({ plugin, bus, ports })
		badge.mount()
		enqueue(bus, 'p1', 'accepted')
		expect(host.querySelector('[data-testid="mcp-status-bar"]')).toBeNull()
	})

	it('decrements on proposalDecided', () => {
		const ports = fakeModulePorts()
		const bus = createEventBus()
		const plugin = makeFakePlugin(host)
		const badge = new SpecoratorStatusBar({ plugin, bus, ports })
		badge.mount()

		enqueue(bus, 'p1', 'pending')
		enqueue(bus, 'p2', 'pending')
		decide(bus, 'p1')
		const el = host.querySelector('[data-testid="mcp-status-bar"]')
		expect(el?.textContent).toContain('MCP: 1 pending')
	})

	it('REMOVES the DOM element when count returns to 0 (EC-MHP-035 — not display:none)', () => {
		const ports = fakeModulePorts()
		const bus = createEventBus()
		const plugin = makeFakePlugin(host)
		const badge = new SpecoratorStatusBar({ plugin, bus, ports })
		badge.mount()

		enqueue(bus, 'p1', 'pending')
		expect(host.querySelector('[data-testid="mcp-status-bar"]')).not.toBeNull()
		decide(bus, 'p1')
		expect(host.querySelector('[data-testid="mcp-status-bar"]')).toBeNull()
	})

	it('uses aria-live="polite" for screen-reader updates (SPEC-MHP-041)', () => {
		const ports = fakeModulePorts()
		const bus = createEventBus()
		const plugin = makeFakePlugin(host)
		const badge = new SpecoratorStatusBar({ plugin, bus, ports })
		badge.mount()
		enqueue(bus, 'p1', 'pending')
		const el = host.querySelector('[data-testid="mcp-status-bar"]')
		expect(el?.getAttribute('aria-live')).toBe('polite')
	})

	it('renders 100+ N as absolute integer — no "99+" truncation (Part B §S13)', () => {
		const ports = fakeModulePorts()
		const bus = createEventBus()
		const plugin = makeFakePlugin(host)
		const badge = new SpecoratorStatusBar({ plugin, bus, ports })
		badge.mount()
		for (let i = 0; i < 137; i++) {
			enqueue(bus, `p-${i}`, 'pending')
		}
		const el = host.querySelector('[data-testid="mcp-status-bar"]')
		expect(el?.textContent).toContain('MCP: 137 pending')
		expect(el?.textContent).not.toContain('99+')
	})

	it('TEST-MHP-054: dispose() unsubscribes from EventBus BEFORE releasing DOM (RISK-MHP-012)', () => {
		const ports = fakeModulePorts()
		const bus = createEventBus()
		const plugin = makeFakePlugin(host)
		const badge = new SpecoratorStatusBar({ plugin, bus, ports })
		badge.mount()

		enqueue(bus, 'p1', 'pending')
		const beforeCount = bus.listenerCount()
		expect(beforeCount).toBeGreaterThan(0)

		expect(() => { badge.dispose(); }).not.toThrow()
		// Listeners released.
		expect(bus.listenerCount()).toBeLessThan(beforeCount)

		// A late event must not throw and must not resurrect the DOM element.
		expect(() => { enqueue(bus, 'p2', 'pending'); }).not.toThrow()
		expect(host.querySelector('[data-testid="mcp-status-bar"]')).toBeNull()
	})

	it('TEST-MHP-054: dispose during an in-flight event does not throw (EC-MHP-037)', () => {
		const ports = fakeModulePorts()
		const bus = createEventBus()
		const plugin = makeFakePlugin(host)
		const badge = new SpecoratorStatusBar({ plugin, bus, ports })
		badge.mount()
		// Subscribe a side-listener that disposes the badge mid-fan-out.
		bus.on('proposalEnqueued' as never, vi.fn(() => { badge.dispose(); }))
		expect(() => { enqueue(bus, 'p1', 'pending'); }).not.toThrow()
	})
})
