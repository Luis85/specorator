/**
 * QW-B — Tests for `ObsidianBridge.getActiveFilePath()` /
 * `getActiveSelection()`.
 *
 * The bridge wraps Obsidian's `workspace.getActiveFile()?.path` and the
 * editor's `getSelection()`. Both must be defensive: the active-editor
 * surface is intermittently `undefined` during view transitions, and an
 * empty-string selection is normalised to `null` so the suffix composer
 * doesn't emit an empty `Selection:` row.
 */
import { describe, it, expect } from 'vitest';
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge';
import type { PluginSettings } from '@/domain/settings/PluginSettings';

interface FakeApp {
	vault: { adapter: unknown };
	fileManager: Record<string, unknown>;
	workspace: {
		getActiveFile?: () => { path: string } | null;
		activeEditor?: { editor?: { getSelection?: () => string } } | null;
	};
}

function makeBridge(workspace: FakeApp['workspace']): ObsidianBridge {
	const app: FakeApp = {
		vault: { adapter: {} },
		fileManager: {},
		workspace,
	};
	const settings: PluginSettings = {
		specsFolder: 'specs',
		logLevel: 'warn',
	} as PluginSettings;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return new ObsidianBridge(app as any, () => settings, async () => undefined);
}

describe('ObsidianBridge.getActiveFilePath (QW-B)', () => {
	it('returns the active TFile path when one is present', () => {
		const bridge = makeBridge({
			getActiveFile: () => ({ path: 'specs/foo/idea.md' }),
		});
		expect(bridge.getActiveFilePath()).toBe('specs/foo/idea.md');
	});

	it('returns null when no file is active', () => {
		const bridge = makeBridge({
			getActiveFile: () => null,
		});
		expect(bridge.getActiveFilePath()).toBeNull();
	});
});

describe('ObsidianBridge.getActiveSelection (QW-B)', () => {
	it('returns the editor selection when non-empty', () => {
		const bridge = makeBridge({
			activeEditor: { editor: { getSelection: () => 'selected text' } },
		});
		expect(bridge.getActiveSelection()).toBe('selected text');
	});

	it('returns null when the selection is empty', () => {
		const bridge = makeBridge({
			activeEditor: { editor: { getSelection: () => '' } },
		});
		expect(bridge.getActiveSelection()).toBeNull();
	});

	it('returns null when the active editor surface is missing', () => {
		const bridge = makeBridge({ activeEditor: null });
		expect(bridge.getActiveSelection()).toBeNull();
	});

	it('returns null when activeEditor.editor is undefined', () => {
		const bridge = makeBridge({ activeEditor: {} });
		expect(bridge.getActiveSelection()).toBeNull();
	});

	it('returns null when getSelection throws (view-transition race)', () => {
		const bridge = makeBridge({
			activeEditor: {
				editor: {
					getSelection: () => {
						throw new Error('editor not ready');
					},
				},
			},
		});
		expect(bridge.getActiveSelection()).toBeNull();
	});
});
