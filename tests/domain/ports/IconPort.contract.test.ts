/**
 * Contract test for IconPort (REQ-AUX-001, ADR-AUX-001, spec §1.1).
 *
 * Asserts the three invariants every implementation must honour:
 *   1. setIcon() must not throw, even when the name does not resolve.
 *   2. setIcon() is idempotent — same (el, name) twice produces the same
 *      DOM state.
 *   3. When the name resolves, setIcon() writes an <svg> child carrying the
 *      icon name.
 *
 * The MockBridge implementation is the reference impl for tests + the
 * GitHub Pages demo (LocalStorageBridge mirrors it).
 */
import { describe, expect, it } from 'vitest'
import type { IconPort } from '@/domain/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

function port(): IconPort {
	return new MockBridge()
}

function snapshot(el: Element): string {
	const svgs = el.querySelectorAll('svg')
	const parts: string[] = []
	svgs.forEach((svg) => {
		const data = svg.getAttribute('data-icon') ?? ''
		const title = svg.querySelector('title')?.textContent ?? ''
		parts.push(`${data}|${title}`)
	})
	return parts.join(',')
}

describe('IconPort contract', () => {
	it('does not throw on an unknown icon name', () => {
		const el = document.createElement('div')
		expect(() => {
			port().setIcon(el, 'definitely-not-a-real-icon-xyz')
		}).not.toThrow()
	})

	it('writes an <svg> child carrying the icon name when name resolves', () => {
		const el = document.createElement('span')
		port().setIcon(el, 'send')
		const svg = el.querySelector('svg')
		expect(svg).not.toBeNull()
		expect(svg?.getAttribute('data-icon')).toBe('send')
		expect(svg?.querySelector('title')?.textContent).toBe('send')
	})

	it('is idempotent — calling twice with the same (el, name) yields the same DOM', () => {
		const el = document.createElement('span')
		const p = port()
		p.setIcon(el, 'send')
		const first = snapshot(el)
		p.setIcon(el, 'send')
		expect(snapshot(el)).toBe(first)
		// Still exactly one svg child — the impl cleared prior children before re-rendering.
		expect(el.querySelectorAll('svg').length).toBe(1)
	})
})
