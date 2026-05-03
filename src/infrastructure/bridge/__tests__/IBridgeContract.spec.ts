import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type IBridge } from '../IBridge';
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge';
import { MockBridge } from '@/infrastructure/mock/MockBridge';

interface BridgeScenario {
	readonly bridge: IBridge;
	readonly readOpenedFile: () => string | null;
	readonly readNotices: () => { message: string; durationMs: number }[];
}

interface BridgeHarness {
	readonly name: string;
	readonly makeScenario: () => BridgeScenario;
}

function registerBridgeContract(harness: BridgeHarness): void {
	describe(`${harness.name} IBridge contract`, () => {
		let scenario: BridgeScenario;
		let bridge: IBridge;

		beforeEach(() => {
			scenario = harness.makeScenario();
			bridge = scenario.bridge;
		});

		it('reads content after writeFile and reports existence', async () => {
			await bridge.writeFile('specs/search/workflow-state.md', 'state');

			expect(await bridge.fileExists('specs/search/workflow-state.md')).toBe(true);
			expect(await bridge.readFile('specs/search/workflow-state.md')).toBe('state');
		});

		it('rejects readFile for a missing file', async () => {
			await expect(bridge.readFile('specs/missing/workflow-state.md')).rejects.toThrow(
				'File not found',
			);
		});

		it('removes files idempotently', async () => {
			await bridge.writeFile('specs/search/workflow-state.md', 'state');

			await bridge.deleteFile('specs/search/workflow-state.md');
			await bridge.deleteFile('specs/search/workflow-state.md');

			expect(await bridge.fileExists('specs/search/workflow-state.md')).toBe(false);
		});

		it('lists direct child files under a folder', async () => {
			await bridge.writeFile('specs/search/workflow-state.md', 'state');
			await bridge.writeFile('specs/search/idea.md', 'idea');
			await bridge.writeFile('specs/search/nested/deep.md', 'deep');
			await bridge.writeFile('specs/other/workflow-state.md', 'other');

			const files = await bridge.listFiles('specs/search');

			expect(files.sort()).toEqual(['specs/search/idea.md', 'specs/search/workflow-state.md']);
		});

		it('lists immediate child folders under a parent', async () => {
			await bridge.writeFile('specs/search/workflow-state.md', 'state');
			await bridge.writeFile('specs/dark-mode/workflow-state.md', 'state');
			await bridge.writeFile('notes/today.md', 'note');

			const folders = await bridge.listFolders('specs');

			expect(folders.sort()).toEqual(['dark-mode', 'search']);
		});

		it('allows createFolder to be called before writing files', async () => {
			await expect(bridge.createFolder('specs/new-feature')).resolves.toBeUndefined();
			await bridge.writeFile('specs/new-feature/workflow-state.md', 'state');

			expect(await bridge.readFile('specs/new-feature/workflow-state.md')).toBe('state');
		});

		it('returns defensive settings copies and persists saved settings', async () => {
			const initial = await bridge.getSettings();
			const mutableInitial = initial as { locale: string };
			mutableInitial.locale = 'de';

			expect((await bridge.getSettings()).locale).toBe(DEFAULT_SETTINGS.locale);

			await bridge.saveSettings({ ...DEFAULT_SETTINGS, locale: 'de', specsFolder: 'plans' });
			const saved = await bridge.getSettings();

			expect(saved.locale).toBe('de');
			expect(saved.specsFolder).toBe('plans');

			const mutableSaved = saved as { specsFolder: string };
			mutableSaved.specsFolder = 'mutated';
			expect((await bridge.getSettings()).specsFolder).toBe('plans');
		});

		it('emits openFile and notice signals with default notice duration', async () => {
			await bridge.openFile('specs/search/workflow-state.md');
			bridge.showNotice('hello');

			expect(scenario.readOpenedFile()).toBe('specs/search/workflow-state.md');
			expect(scenario.readNotices()).toEqual([{ message: 'hello', durationMs: 4000 }]);
		});
	});
}

registerBridgeContract({
	name: 'MockBridge',
	makeScenario: () => {
		const bridge = new MockBridge();
		return {
			bridge,
			readOpenedFile: () => bridge.getOpenedFile(),
			readNotices: () => bridge.getNotices(),
		};
	},
});

registerBridgeContract({
	name: 'LocalStorageBridge',
	makeScenario: () => {
		localStorage.clear();
		let openedFile: string | null = null;
		const notices: { message: string; durationMs: number }[] = [];
		const abort = new AbortController();

		window.addEventListener(
			'sp:open-file',
			(event) => {
				openedFile = (event as CustomEvent<{ path: string }>).detail.path;
			},
			{ signal: abort.signal },
		);
		window.addEventListener(
			'sp:notice',
			(event) => {
				notices.push((event as CustomEvent<{ message: string; durationMs: number }>).detail);
			},
			{ signal: abort.signal },
		);

		return {
			bridge: new LocalStorageBridge(),
			readOpenedFile: () => {
				abort.abort();
				return openedFile;
			},
			readNotices: () => {
				abort.abort();
				return notices;
			},
		};
	},
});
