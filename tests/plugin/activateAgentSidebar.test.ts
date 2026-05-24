/**
 * T-PSR-010 (TEST-PSR-012 / TEST-PSR-013) — `activateAgentSidebar` reveal-or-create
 * edge cases (SPEC-PSR-007 E1/E2). Traces: REQ-PSR-002, REQ-PSR-003, NFR-PSR-003.
 */
import { describe, it, expect, vi } from 'vitest';

// Proxy obsidian mock: a no-op (callable + constructable) for every export so
// main.ts's import chain (Plugin, ItemView, …) resolves under vitest.
vi.mock('obsidian', () => {
	const reserved = (p: string | symbol): boolean =>
		typeof p !== 'string' || p === '__esModule' || p === 'default' || p === 'then';
	const cache = new Map<string, unknown>();
	return new Proxy(
		{},
		{
			has: (_t, p) => !reserved(p),
			get: (_t, p) => {
				if (reserved(p)) return undefined;
				const key = p as string;
				let v = cache.get(key);
				if (v === undefined) {
					v = function NoOp() {};
					cache.set(key, v);
				}
				return v;
			},
		},
	);
});

import SpecoratorPlugin from '@/plugin/main';

interface FakeLeaf {
	setViewState: ReturnType<typeof vi.fn>;
	loadIfDeferred: ReturnType<typeof vi.fn>;
}

function pluginWith(workspace: unknown): SpecoratorPlugin {
	const plugin = Object.create(SpecoratorPlugin.prototype) as SpecoratorPlugin;
	(plugin as unknown as { app: { workspace: unknown } }).app = { workspace };
	return plugin;
}

describe('activateAgentSidebar (SPEC-PSR-007)', () => {
	it('TEST-PSR-012: E1 — called twice yields one leaf and reveals it', async () => {
		const created: FakeLeaf[] = [];
		const leaf: FakeLeaf = {
			setViewState: vi.fn(async () => {
				created.push(leaf);
			}),
			loadIfDeferred: vi.fn(async () => {}),
		};
		const revealLeaf = vi.fn(async () => {});
		const workspace = {
			getLeavesOfType: vi.fn(() => created),
			getRightLeaf: vi.fn(() => leaf),
			revealLeaf,
		};
		const plugin = pluginWith(workspace);

		await plugin.activateAgentSidebar();
		await plugin.activateAgentSidebar();

		expect(created).toHaveLength(1);
		expect(leaf.setViewState).toHaveBeenCalledTimes(1);
		expect(revealLeaf).toHaveBeenCalledTimes(2);
	});

	it('TEST-PSR-013: E2 — getRightLeaf null returns without throwing', async () => {
		const revealLeaf = vi.fn(async () => {});
		const workspace = {
			getLeavesOfType: vi.fn(() => []),
			getRightLeaf: vi.fn(() => null),
			revealLeaf,
		};
		const plugin = pluginWith(workspace);

		await expect(plugin.activateAgentSidebar()).resolves.toBeUndefined();
		expect(revealLeaf).not.toHaveBeenCalled();
	});
});
