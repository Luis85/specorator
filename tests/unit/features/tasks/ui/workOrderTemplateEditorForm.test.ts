// ProviderRegistry drives providerOptionList / modelOptionList. Each test tunes
// the mock via the exposed jest.fn()s.
jest.mock('../../../../../src/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    getRegisteredProviderIds: jest.fn().mockReturnValue(['claude', 'codex']),
    isEnabled: jest.fn().mockReturnValue(true),
    getChatUIConfig: jest.fn(),
  },
}));

import { ProviderRegistry } from '../../../../../src/core/providers/ProviderRegistry';
import type { TemplateEditorForm } from '../../../../../src/features/tasks/ui/workOrderTemplateEditorForm';
import {
  buildTemplatePayload,
  createInitialForm,
  modelOptionList,
  providerOptionList,
} from '../../../../../src/features/tasks/ui/workOrderTemplateEditorForm';

const registry = ProviderRegistry as unknown as {
  getRegisteredProviderIds: jest.Mock;
  isEnabled: jest.Mock;
  getChatUIConfig: jest.Mock;
};

const SETTINGS: Record<string, unknown> = {};

beforeEach(() => {
  registry.getRegisteredProviderIds.mockReturnValue(['claude', 'codex']);
  registry.isEnabled.mockReturnValue(true);
  registry.getChatUIConfig.mockReset();
});

describe('providerOptionList', () => {
  it('leads with the "Use default" empty option then every enabled provider id', () => {
    const options = providerOptionList(SETTINGS);
    expect(options[0]).toEqual({ value: '', label: 'Use default' });
    expect(options.slice(1)).toEqual([
      { value: 'claude', label: 'claude' },
      { value: 'codex', label: 'codex' },
    ]);
  });

  it('filters out providers that are not enabled', () => {
    registry.isEnabled.mockImplementation((id: string) => id === 'claude');
    expect(providerOptionList(SETTINGS).map((o) => o.value)).toEqual(['', 'claude']);
  });
});

describe('modelOptionList', () => {
  it('returns default-only when no provider is selected (no registry lookup)', () => {
    expect(modelOptionList('', SETTINGS)).toEqual([{ value: '', label: 'Use default' }]);
    expect(registry.getChatUIConfig).not.toHaveBeenCalled();
  });

  it('returns default-only for a provider id that is not registered', () => {
    expect(modelOptionList('ghost', SETTINGS)).toEqual([{ value: '', label: 'Use default' }]);
    expect(registry.getChatUIConfig).not.toHaveBeenCalled();
  });

  it('appends the provider model options after the empty default', () => {
    registry.getChatUIConfig.mockReturnValue({
      getModelOptions: () => [
        { value: 'gpt-5', label: 'GPT-5' },
        { value: 'gpt-5-mini', label: 'GPT-5 mini' },
      ],
    });
    expect(modelOptionList('codex', SETTINGS)).toEqual([
      { value: '', label: 'Use default' },
      { value: 'gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-mini', label: 'GPT-5 mini' },
    ]);
  });

  it('falls back to default-only when the provider cannot resolve model options', () => {
    registry.getChatUIConfig.mockImplementation(() => {
      throw new Error('no sync model options');
    });
    expect(modelOptionList('codex', SETTINGS)).toEqual([{ value: '', label: 'Use default' }]);
  });
});

describe('buildTemplatePayload', () => {
  function form(overrides: Partial<TemplateEditorForm> = {}): TemplateEditorForm {
    return {
      name: '  My Template  ',
      description: '',
      icon: '',
      provider: '',
      model: '',
      priority: '',
      loop: '',
      agent: '',
      body: '  # Body  ',
      chainTemplate: '',
      chainTitle: '',
      chainObjective: '',
      chainTrigger: '',
      ...overrides,
    };
  }

  it('trims name/body and collapses blank optionals to undefined; no originalPath for a new template', () => {
    expect(buildTemplatePayload(form())).toEqual({
      name: 'My Template',
      description: undefined,
      icon: undefined,
      provider: undefined,
      model: undefined,
      priority: undefined,
      loop: undefined,
      agent: undefined,
      body: '# Body',
      originalPath: undefined,
    });
  });

  it('keeps populated optionals (trimmed) and passes originalPath through when editing', () => {
    const payload = buildTemplatePayload(
      form({
        description: '  Fix a bug ',
        icon: ' bug ',
        provider: 'claude',
        model: 'claude-sonnet-4',
        priority: '1 - high',
        loop: 'my-loop',
        agent: 'roster:debugger',
      }),
      'Agent Board/templates/bug-fix.md',
    );
    expect(payload).toEqual({
      name: 'My Template',
      description: 'Fix a bug',
      icon: 'bug',
      provider: 'claude',
      model: 'claude-sonnet-4',
      priority: '1 - high',
      loop: 'my-loop',
      agent: 'roster:debugger',
      body: '# Body',
      originalPath: 'Agent Board/templates/bug-fix.md',
    });
  });
});

describe('template editor chain fields', () => {
  it('seeds chain fields from an existing template', () => {
    const form = createInitialForm({ path: 'p', name: 'T', body: 'b', chain: { template: 'Impl', trigger: 'review' } });
    expect(form.chainTemplate).toBe('Impl');
    expect(form.chainTrigger).toBe('review');
  });

  it('builds a chain in the payload only when a successor is configured', () => {
    const base = createInitialForm(null);
    expect(buildTemplatePayload({ ...base, name: 'T' }).chain).toBeUndefined();
    const withChain = buildTemplatePayload({ ...base, name: 'T', chainTemplate: 'Impl', chainTrigger: 'done' });
    expect(withChain.chain).toEqual({ template: 'Impl', trigger: 'done' });
  });

  it('preserves an existing template chain through an untouched editor round-trip', () => {
    // Opening a chained template and saving WITHOUT touching the chain fields must not drop
    // the successor config (Codex P2: a description/body edit silently disabled the chain).
    const existing = { path: 'p', name: 'T', body: 'b', chain: { template: 'Impl', title: 'Wire it', trigger: 'review' as const } };
    const payload = buildTemplatePayload(createInitialForm(existing));
    expect(payload.chain).toEqual({ template: 'Impl', title: 'Wire it', trigger: 'review' });
  });
});
