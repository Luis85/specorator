/**
 * T-RR-008 (TEST-RR-024, U leg) — RED: per-bridge `createIconPort()` factory.
 *
 * SPEC-RR-012 / ADR-RR-001 §4: `MockBridge` and `LocalStorageBridge` expose
 * `createIconPort(): IconPort` returning a declarative `IconNode` for the P2 icon
 * set (status icons `check`/`x`/`shield-off`/`dot`, the generic `wrench`, and the
 * tool icons `file`/`terminal`/`search`/`bot`); an unknown name resolves to
 * `null`. The two non-Obsidian bridges share the same static map so the demo +
 * `npm run dev` render icons without Obsidian. The `ObsidianBridge` row (→ the
 * `setIcon` walk) is coverage-excluded infra exercised by the manual leg of
 * TEST-RR-026; it is not instantiated here.
 *
 * The returned `IconNode` is a pure DTO — `{ tag, attrs, children }`, no DOM
 * element, no HTML string, no DOM-injection sink (NFR-RR-006).
 *
 * Fails (RED) until T-RR-009 adds `createIconPort()` to the two bridges.
 *
 * Traces: TEST-RR-024 (U leg), SPEC-RR-012, REQ-RR-019, NFR-RR-002, NFR-RR-006.
 */
import { describe, it, expect } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge';
import type { IconNode, IconPort } from '@/domain/ports';

const P2_ICON_NAMES = [
	'check',
	'x',
	'shield-off',
	'dot',
	'wrench',
	'file',
	'terminal',
	'search',
	'bot',
] as const;

function assertIconNodeShape(node: IconNode): void {
	expect(typeof node.tag).toBe('string');
	expect(node.tag.length).toBeGreaterThan(0);
	expect(typeof node.attrs).toBe('object');
	expect(node.attrs).not.toBeNull();
	for (const value of Object.values(node.attrs)) {
		expect(typeof value).toBe('string');
	}
	expect(Array.isArray(node.children)).toBe(true);
	for (const child of node.children) {
		assertIconNodeShape(child);
	}
}

describe('createIconPort() factory (TEST-RR-024 U leg) — MockBridge', () => {
	it('exposes an IconPort with a setIcon method', () => {
		const port: IconPort = new MockBridge().createIconPort();
		expect(typeof port.setIcon).toBe('function');
	});

	it.each(P2_ICON_NAMES)('resolves the P2 icon %s to a declarative IconNode', (name) => {
		const port = new MockBridge().createIconPort();
		const node = port.setIcon(name);
		expect(node).not.toBeNull();
		assertIconNodeShape(node as IconNode);
	});

	it('returns null for an unknown icon name', () => {
		const port = new MockBridge().createIconPort();
		expect(port.setIcon('definitely-not-an-icon')).toBeNull();
	});

	it('is pure/total — repeated calls for the same name are structurally equal', () => {
		const port = new MockBridge().createIconPort();
		expect(port.setIcon('check')).toEqual(port.setIcon('check'));
	});

	it('the IconNode carries no DOM element or HTML string (declarative only, NFR-RR-006)', () => {
		const port = new MockBridge().createIconPort();
		const node = port.setIcon('check') as IconNode;
		// Serialising round-trips: a real DOM node would throw / lose data.
		expect(() => JSON.stringify(node)).not.toThrow();
		const serialised = JSON.stringify(node);
		expect(serialised).not.toContain('<');
	});
});

describe('createIconPort() factory (TEST-RR-024 U leg) — LocalStorageBridge', () => {
	it('exposes an IconPort with a setIcon method', () => {
		const port: IconPort = new LocalStorageBridge().createIconPort();
		expect(typeof port.setIcon).toBe('function');
	});

	it.each(P2_ICON_NAMES)('resolves the P2 icon %s to a declarative IconNode', (name) => {
		const port = new LocalStorageBridge().createIconPort();
		const node = port.setIcon(name);
		expect(node).not.toBeNull();
		assertIconNodeShape(node as IconNode);
	});

	it('returns null for an unknown icon name', () => {
		const port = new LocalStorageBridge().createIconPort();
		expect(port.setIcon('definitely-not-an-icon')).toBeNull();
	});

	it('shares the same static map as MockBridge (demo/dev parity)', () => {
		const mock = new MockBridge().createIconPort();
		const local = new LocalStorageBridge().createIconPort();
		for (const name of P2_ICON_NAMES) {
			expect(local.setIcon(name)).toEqual(mock.setIcon(name));
		}
		expect(local.setIcon('unknown')).toEqual(mock.setIcon('unknown'));
	});
});
