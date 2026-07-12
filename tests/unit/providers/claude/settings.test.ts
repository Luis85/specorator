import { EventBus } from '@/core/events/EventBus';
import type { PluginContext } from '@/core/types/PluginContext';
import {
  applyClaudeLoadUserSettings,
  DEFAULT_CLAUDE_PROVIDER_SETTINGS,
  getClaudeProviderSettings,
  resolveClaudeSettingSources,
  updateClaudeProviderSettings,
} from '@/providers/claude/settings';

describe('resolveClaudeSettingSources (SEC-2 gate)', () => {
  it('includes project/local by default (non-risky vault unaffected)', () => {
    expect(resolveClaudeSettingSources(true)).toEqual(['user', 'project', 'local']);
    expect(resolveClaudeSettingSources(false)).toEqual(['project', 'local']);
  });

  it('honors project/local explicitly when honorProjectSettings is true', () => {
    expect(resolveClaudeSettingSources(true, true)).toEqual(['user', 'project', 'local']);
    expect(resolveClaudeSettingSources(false, true)).toEqual(['project', 'local']);
  });

  it('withholds project/local when honorProjectSettings is false', () => {
    expect(resolveClaudeSettingSources(true, false)).toEqual(['user']);
    expect(resolveClaudeSettingSources(false, false)).toEqual([]);
  });
});

describe('Claude provider enabled flag', () => {
  it('defaults to disabled when settings are absent (providers are opt-in)', () => {
    expect(DEFAULT_CLAUDE_PROVIDER_SETTINGS.enabled).toBe(false);
    expect(getClaudeProviderSettings({}).enabled).toBe(false);
  });

  it('treats a missing enabled field as disabled (opt-in default)', () => {
    const settings = {
      providerConfigs: {
        claude: { safeMode: 'auto' },
      },
    };
    expect(getClaudeProviderSettings(settings).enabled).toBe(false);
  });

  it('respects an explicit true', () => {
    const settings = {
      providerConfigs: {
        claude: { enabled: true },
      },
    };
    expect(getClaudeProviderSettings(settings).enabled).toBe(true);
  });

  it('respects an explicit false', () => {
    const settings = {
      providerConfigs: {
        claude: { enabled: false },
      },
    };
    expect(getClaudeProviderSettings(settings).enabled).toBe(false);
  });

  it('persists the enabled flag through the update writer', () => {
    const settings: Record<string, unknown> = {};
    updateClaudeProviderSettings(settings, { enabled: false });
    expect(getClaudeProviderSettings(settings).enabled).toBe(false);

    updateClaudeProviderSettings(settings, { enabled: true });
    expect(getClaudeProviderSettings(settings).enabled).toBe(true);
  });
});

describe('applyClaudeLoadUserSettings', () => {
  function mockPlugin(initial: boolean) {
    const settings: Record<string, unknown> = {
      providerConfigs: { claude: { loadUserSettings: initial } },
    };
    const events = new EventBus<{ 'vaultSkill.changed': { providerId: 'claude' } }>();
    const saveSettings = jest.fn(async () => {});
    const plugin = { settings, saveSettings, events } as unknown as PluginContext;
    return { plugin, settings, events, saveSettings };
  }

  it('persists the flag, saves, and invalidates cached Claude skills when disabled', async () => {
    const { plugin, settings, events, saveSettings } = mockPlugin(true);
    const invalidations: Array<{ providerId: string }> = [];
    events.on('vaultSkill.changed', (p) => invalidations.push(p));

    await applyClaudeLoadUserSettings(plugin, false);

    expect(getClaudeProviderSettings(settings).loadUserSettings).toBe(false);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    // Without this invalidation, cached ~/.claude/skills entries stay runnable
    // until the aggregator TTL — and their /name fails once the runtime drops
    // the `user` setting source.
    expect(invalidations).toEqual([{ providerId: 'claude' }]);
  });

  it('also invalidates when re-enabling so user skills reappear without waiting for TTL', async () => {
    const { plugin, settings, events } = mockPlugin(false);
    const invalidations: Array<{ providerId: string }> = [];
    events.on('vaultSkill.changed', (p) => invalidations.push(p));

    await applyClaudeLoadUserSettings(plugin, true);

    expect(getClaudeProviderSettings(settings).loadUserSettings).toBe(true);
    expect(invalidations).toEqual([{ providerId: 'claude' }]);
  });
});

describe('Claude customModels normalization', () => {
  it('defaults customModels to an empty array', () => {
    expect(DEFAULT_CLAUDE_PROVIDER_SETTINGS.customModels).toEqual([]);
    expect(getClaudeProviderSettings({}).customModels).toEqual([]);
  });

  it('parses a legacy newline-delimited string into an array of user-sourced rows', () => {
    const settings = {
      providerConfigs: {
        claude: { customModels: 'haiku\nopus' },
      },
    };
    expect(getClaudeProviderSettings(settings).customModels).toEqual([
      { id: 'haiku', source: 'user' },
      { id: 'opus', source: 'user' },
    ]);
  });

  it('trims, drops blanks, and dedups legacy string entries', () => {
    const settings = {
      providerConfigs: {
        claude: { customModels: '  haiku  \n\nopus\nhaiku\n' },
      },
    };
    expect(getClaudeProviderSettings(settings).customModels).toEqual([
      { id: 'haiku', source: 'user' },
      { id: 'opus', source: 'user' },
    ]);
  });

  it('accepts an array shape unchanged, preserving label and contextWindow', () => {
    const settings = {
      providerConfigs: {
        claude: {
          customModels: [
            { id: 'opus', label: 'Work Opus', contextWindow: 500000, source: 'user' },
            { id: 'haiku', source: 'env' },
          ],
        },
      },
    };
    expect(getClaudeProviderSettings(settings).customModels).toEqual([
      { id: 'opus', label: 'Work Opus', contextWindow: 500000, source: 'user' },
      { id: 'haiku', source: 'env' },
    ]);
  });

  it('returns an empty array for malformed values', () => {
    const settings = {
      providerConfigs: {
        claude: { customModels: 42 },
      },
    };
    expect(getClaudeProviderSettings(settings).customModels).toEqual([]);
  });

  it('persists array entries through the update writer', () => {
    const settings: Record<string, unknown> = {};
    updateClaudeProviderSettings(settings, {
      customModels: [{ id: 'opus', contextWindow: 800000, source: 'user' }],
    });
    expect(getClaudeProviderSettings(settings).customModels).toEqual([
      { id: 'opus', contextWindow: 800000, source: 'user' },
    ]);
  });
});
