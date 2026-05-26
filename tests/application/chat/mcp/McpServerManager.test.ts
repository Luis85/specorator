/**
 * TEST-MC-010..016/050/051/052..054/072 — the `McpServerManager` lifecycle use case
 * (SPEC-MC-012, ADR-MC-003 §2).
 *
 * Drives the full lifecycle over the scriptable `MockMcpConfigStore`:
 *  - `load()` → `store.load()`; on `ok` sets the in-memory list; on `err` →
 *    `feedback` notice + keeps `[]` (never crashes, REQ-MC-071);
 *  - `add(draft)` appends `{ ...draft, enabled:true, contextSaving }` with
 *    `DEFAULT_MCP_SERVER` defaults + AWAITS `store.save` (open item #4); an empty or
 *    DUPLICATE name → `err`, the existing server UNCHANGED (REQ-MC-010/011, EC-MC-4);
 *    a save `err` → notify + `err` with the in-memory mutation rolled back (EC-MC-18);
 *  - `edit`/`remove`/`setEnabled`/`setToolDisabled` locate by `name` (missing → `err`),
 *    mutate, AWAIT `store.save`; `setToolDisabled(name,tool,true)` adds to
 *    `disabledTools`, `false` removes (REQ-MC-012/013/014/016);
 *  - `getEnabledCount` counts enabled servers (REQ-MC-015);
 *  - `getActiveServers(∅)` delegates to the pure `getActiveServers` (SPEC-MC-006),
 *    `getEnabledMcpServers(∅)` delegates to `foldEnabledMcpServers` (SPEC-MC-013) —
 *    `undefined` when the active set is empty (REQ-MC-052/082);
 *  - the manager NEVER throws across a port boundary (`Result`-wrapped store + total
 *    pure delegates, NFR-MC-004).
 *
 * Traces: TEST-MC-010..016/050/051/052..054/072, SPEC-MC-012, REQ-MC-010..016/050/051/
 * 052..054/071/072, NFR-MC-004, EC-MC-4/8/9/10/18.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServerManager } from '@/application/chat/mcp/McpServerManager';
import type { McpServerDraft } from '@/application/chat/mcp/McpServerManager';
import { FeedbackService } from '@/application/shared/FeedbackService';
import { MockMcpConfigStore } from '@/infrastructure/mock/MockMcpConfigStore';
import type { LoggerPort, NotificationPort } from '@/domain/ports';
import type { ManagedMcpServer, McpServerConfig } from '@/domain/chat/mcp/McpTypes';

const EMPTY = new Set<string>();

function makeLogger(): LoggerPort {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeNotify(): NotificationPort {
	return {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	};
}

const stdioConfig: McpServerConfig = { command: 'node', args: ['server.js'] };
const sseConfig: McpServerConfig = { type: 'sse', url: 'https://example.com/sse' };

function draft(partial: Partial<McpServerDraft> & Pick<McpServerDraft, 'name'>): McpServerDraft {
	return {
		name: partial.name,
		config: partial.config ?? stdioConfig,
		description: partial.description,
		contextSaving: partial.contextSaving ?? false,
	};
}

function managedServer(partial: Partial<ManagedMcpServer> & Pick<ManagedMcpServer, 'name'>): ManagedMcpServer {
	return {
		name: partial.name,
		config: partial.config ?? stdioConfig,
		enabled: partial.enabled ?? true,
		contextSaving: partial.contextSaving ?? false,
		disabledTools: partial.disabledTools,
		description: partial.description,
	};
}

describe('McpServerManager', () => {
	let store: MockMcpConfigStore;
	let logger: LoggerPort;
	let notify: NotificationPort;
	let feedback: FeedbackService;
	let manager: McpServerManager;

	beforeEach(() => {
		store = new MockMcpConfigStore();
		logger = makeLogger();
		notify = makeNotify();
		feedback = new FeedbackService(logger, notify);
		manager = new McpServerManager(store, feedback);
	});

	describe('load (TEST-MC-010, REQ-MC-001/002/071)', () => {
		it('loads the seeded list from the store and exposes it via getServers', async () => {
			store.seedMcpServers([managedServer({ name: 'alpha' })]);

			const result = await manager.load();

			expect(result.ok).toBe(true);
			if (result.ok) expect(result.value.map((s) => s.name)).toEqual(['alpha']);
			expect(manager.getServers().map((s) => s.name)).toEqual(['alpha']);
		});

		it('returns ok([]) for an empty store (load-or-default)', async () => {
			const result = await manager.load();

			expect(result.ok).toBe(true);
			if (result.ok) expect(result.value).toEqual([]);
			expect(manager.getServers()).toEqual([]);
		});

		it('on a store load err notifies and keeps an empty list, never crashing (REQ-MC-071)', async () => {
			store.seedMcpServers([managedServer({ name: 'alpha' })]);
			store.setMcpStoreFailMode('load');

			const result = await manager.load();

			expect(result.ok).toBe(true); // never crashes; degrades to []
			expect(manager.getServers()).toEqual([]);
			expect(notify.showInfo).toHaveBeenCalled();
		});
	});

	describe('add (TEST-MC-010/011, REQ-MC-010/011, EC-MC-4/18)', () => {
		it('appends a server with DEFAULT_MCP_SERVER enabled + the draft contextSaving, awaiting save', async () => {
			await manager.load();

			const result = await manager.add(draft({ name: 'alpha', contextSaving: true, description: 'd' }));

			expect(result.ok).toBe(true);
			// the persisted snapshot reflects the add (await-save proven via reload)
			const reload = await manager.load();
			expect(reload.ok).toBe(true);
			const added = manager.getServers().find((s) => s.name === 'alpha');
			expect(added).toBeDefined();
			expect(added?.enabled).toBe(true);
			expect(added?.contextSaving).toBe(true);
			expect(added?.description).toBe('d');
		});

		it('awaits store.save before resolving the add (the persisted snapshot is already written)', async () => {
			await manager.load();
			const saveSpy = vi.spyOn(store, 'save');

			await manager.add(draft({ name: 'alpha' }));

			expect(saveSpy).toHaveBeenCalledTimes(1);
			// the save promise resolved before add returned: a fresh store load sees alpha
			const fresh = new McpServerManager(store, feedback);
			const reload = await fresh.load();
			expect(reload.ok).toBe(true);
			expect(fresh.getServers().map((s) => s.name)).toContain('alpha');
		});

		it('rejects an empty name without mutating the list (REQ-MC-010)', async () => {
			await manager.load();

			const result = await manager.add(draft({ name: '' }));

			expect(result.ok).toBe(false);
			expect(manager.getServers()).toEqual([]);
		});

		it('rejects a duplicate name and leaves the existing server unchanged (EC-MC-4)', async () => {
			store.seedMcpServers([managedServer({ name: 'alpha', description: 'original' })]);
			await manager.load();

			const result = await manager.add(draft({ name: 'alpha', description: 'replacement' }));

			expect(result.ok).toBe(false);
			expect(manager.getServers()).toHaveLength(1);
			expect(manager.getServers()[0].description).toBe('original');
		});

		it('on a save err notifies, returns err, and rolls back the in-memory mutation (EC-MC-18)', async () => {
			await manager.load();
			store.setMcpStoreFailMode('save');

			const result = await manager.add(draft({ name: 'alpha' }));

			expect(result.ok).toBe(false);
			expect(manager.getServers()).toEqual([]); // rolled back
			expect(notify.showError).toHaveBeenCalled();
		});
	});

	describe('edit (TEST-MC-012, REQ-MC-012)', () => {
		it('replaces config / description / contextSaving by name, awaiting save', async () => {
			store.seedMcpServers([managedServer({ name: 'alpha', config: stdioConfig })]);
			await manager.load();

			const result = await manager.edit(
				'alpha',
				draft({ name: 'alpha', config: sseConfig, description: 'new', contextSaving: true }),
			);

			expect(result.ok).toBe(true);
			const edited = manager.getServers().find((s) => s.name === 'alpha');
			expect(edited?.config).toEqual(sseConfig);
			expect(edited?.description).toBe('new');
			expect(edited?.contextSaving).toBe(true);
		});

		it('returns err for a missing name', async () => {
			await manager.load();

			const result = await manager.edit('ghost', draft({ name: 'ghost' }));

			expect(result.ok).toBe(false);
		});

		it('on a save err rolls back to the prior server snapshot', async () => {
			store.seedMcpServers([managedServer({ name: 'alpha', config: stdioConfig })]);
			await manager.load();
			store.setMcpStoreFailMode('save');

			const result = await manager.edit('alpha', draft({ name: 'alpha', config: sseConfig }));

			expect(result.ok).toBe(false);
			expect(manager.getServers()[0].config).toEqual(stdioConfig);
			expect(notify.showError).toHaveBeenCalled();
		});
	});

	describe('remove (TEST-MC-013, REQ-MC-013)', () => {
		it('removes a server by name, awaiting save', async () => {
			store.seedMcpServers([managedServer({ name: 'alpha' }), managedServer({ name: 'beta' })]);
			await manager.load();

			const result = await manager.remove('alpha');

			expect(result.ok).toBe(true);
			expect(manager.getServers().map((s) => s.name)).toEqual(['beta']);
		});

		it('returns err for a missing name', async () => {
			await manager.load();

			const result = await manager.remove('ghost');

			expect(result.ok).toBe(false);
		});
	});

	describe('setEnabled (TEST-MC-014/051, REQ-MC-014)', () => {
		it('toggles a server enabled flag, awaiting save', async () => {
			store.seedMcpServers([managedServer({ name: 'alpha', enabled: true })]);
			await manager.load();

			const result = await manager.setEnabled('alpha', false);

			expect(result.ok).toBe(true);
			expect(manager.getServers()[0].enabled).toBe(false);
		});

		it('returns err for a missing name', async () => {
			await manager.load();

			const result = await manager.setEnabled('ghost', true);

			expect(result.ok).toBe(false);
		});
	});

	describe('setToolDisabled (TEST-MC-016, REQ-MC-016)', () => {
		it('adds a tool to disabledTools, creating the array', async () => {
			store.seedMcpServers([managedServer({ name: 'alpha' })]);
			await manager.load();

			const result = await manager.setToolDisabled('alpha', 'search', true);

			expect(result.ok).toBe(true);
			expect(manager.getServers()[0].disabledTools).toEqual(['search']);
		});

		it('removes a tool from disabledTools', async () => {
			store.seedMcpServers([managedServer({ name: 'alpha', disabledTools: ['search', 'fetch'] })]);
			await manager.load();

			const result = await manager.setToolDisabled('alpha', 'search', false);

			expect(result.ok).toBe(true);
			expect(manager.getServers()[0].disabledTools).toEqual(['fetch']);
		});

		it('returns err for a missing name', async () => {
			await manager.load();

			const result = await manager.setToolDisabled('ghost', 'search', true);

			expect(result.ok).toBe(false);
		});
	});

	describe('getEnabledCount (TEST-MC-015, REQ-MC-015)', () => {
		it('counts the enabled servers only', async () => {
			store.seedMcpServers([
				managedServer({ name: 'alpha', enabled: true }),
				managedServer({ name: 'beta', enabled: false }),
				managedServer({ name: 'gamma', enabled: true }),
			]);
			await manager.load();

			expect(manager.getEnabledCount()).toBe(2);
		});
	});

	describe('getActiveServers(∅) (TEST-MC-052/053, REQ-MC-052)', () => {
		it('delegates to the pure getActiveServers — excludes disabled + context-saving with ∅ mentions', async () => {
			store.seedMcpServers([
				managedServer({ name: 'alpha', enabled: true, contextSaving: false }),
				managedServer({ name: 'beta', enabled: false, contextSaving: false }),
				managedServer({ name: 'gamma', enabled: true, contextSaving: true }),
			]);
			await manager.load();

			const active = manager.getActiveServers(EMPTY);

			expect(Object.keys(active)).toEqual(['alpha']);
		});
	});

	describe('getEnabledMcpServers(∅) (TEST-MC-052/054/082, REQ-MC-052/082)', () => {
		it('returns undefined when the active set is empty (byte-identical P7)', async () => {
			store.seedMcpServers([managedServer({ name: 'gamma', enabled: true, contextSaving: true })]);
			await manager.load();

			expect(manager.getEnabledMcpServers(EMPTY)).toBeUndefined();
		});

		it('returns the folded value with disallowedTools when the active set is non-empty', async () => {
			store.seedMcpServers([
				managedServer({ name: 'alpha', enabled: true, contextSaving: false, disabledTools: ['search'] }),
			]);
			await manager.load();

			const folded = manager.getEnabledMcpServers(EMPTY);

			expect(folded).toBeDefined();
			expect(Object.keys(folded?.servers ?? {})).toEqual(['alpha']);
			expect(folded?.disallowedTools).toEqual(['mcp__alpha__search']);
		});
	});

	describe('never throws across the port boundary (NFR-MC-004)', () => {
		it('returns a Result rather than throwing when every store op fails', async () => {
			store.setMcpStoreFailMode('save');
			await manager.load();

			await expect(manager.add(draft({ name: 'alpha' }))).resolves.toMatchObject({ ok: false });
			await expect(manager.edit('alpha', draft({ name: 'alpha' }))).resolves.toMatchObject({ ok: false });
			await expect(manager.remove('alpha')).resolves.toMatchObject({ ok: false });
		});
	});
});
