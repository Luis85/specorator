import { TFile } from 'obsidian';

import { launchQuickAction } from '@/features/quickActions/launchQuickAction';
import type { QuickAction } from '@/features/quickActions/types';

jest.mock('obsidian', () => ({ TFile: class TFile { path = ''; }, TFolder: class TFolder { path = ''; } }));
jest.mock('@/i18n/i18n', () => ({
  t: (key: string, vars?: Record<string, string>) => (vars?.name ? `${key}:${vars.name}` : key),
}));

const launchMock = jest.fn();
jest.mock('@/features/quickActions/launchWithModelPicker', () => ({
  launchWithModelPicker: (...a: unknown[]) => launchMock(...a),
}));

const runMock = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/quickActions/runQuickActionForFile', () => ({
  runQuickActionForFile: (...args: unknown[]) => runMock(...args),
  quickActionStemFromPath: (p: string) => (p.split('/').pop()?.replace(/\.md$/, '') ?? p).toLowerCase(),
}));

const ACTION: QuickAction = { id: 'a', name: 'Summarize', description: 'd', prompt: 'p', filePath: 'qa/Summarize.md' };
function makeFile(): TFile { const f = Object.create(TFile.prototype); f.path = 'note.md'; return f as TFile; }

beforeEach(() => jest.clearAllMocks());

describe('launchQuickAction delegation', () => {
  it('delegates to launchWithModelPicker keyed by the bare stem with a non-empty title', async () => {
    const plugin = { app: {}, settings: {} } as never;
    await launchQuickAction(plugin, makeFile(), ACTION);
    expect(launchMock).toHaveBeenCalledTimes(1);
    const [p, launch] = launchMock.mock.calls[0];
    expect(p).toBe(plugin);
    expect(launch.lastUsedKey).toBe('summarize');
    expect(launch.title).toBe('quickActions.launchModal.title:Summarize');
  });

  it('its onConfirm dispatches runQuickActionForFile with the choice', async () => {
    const plugin = { app: {}, settings: {} } as never;
    const file = makeFile();
    await launchQuickAction(plugin, file, ACTION);
    const launch = launchMock.mock.calls[0][1];
    launch.onConfirm({ providerId: 'codex', model: 'gpt-5-codex' });
    expect(runMock).toHaveBeenCalledWith(plugin, file, ACTION, { providerId: 'codex', model: 'gpt-5-codex' });
  });
});
