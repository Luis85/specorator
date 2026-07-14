import {
  resolveCursorEffortForFamily,
  resolveCursorModelForCli,
  resolveCursorModelSelectionForCli,
  shouldAllowFamilyWireFallback,
} from '@/providers/cursor/runtime/cursorCliModel';
import {
  resetCursorModelCatalog,
  seedCursorModelCatalogForTest,
} from '@/providers/cursor/runtime/cursorModelCatalog';
import { CURSOR_STANDARD_MODE } from '@/providers/cursor/runtime/cursorModelFamily';
import { toCursorModelValue } from '@/providers/cursor/runtime/cursorModelId';

describe('resolveCursorModelForCli', () => {
  it('strips the cursor: prefix so the raw id reaches --model', () => {
    expect(resolveCursorModelForCli('cursor:gpt-5.5')).toBe('gpt-5.5');
    expect(resolveCursorModelForCli('cursor:auto')).toBe('auto');
    expect(resolveCursorModelForCli('cursor:composer-2-fast')).toBe('composer-2-fast');
  });

  it('passes non-namespaced ids through unchanged (legacy/back-compat)', () => {
    expect(resolveCursorModelForCli('composer-1')).toBe('composer-1');
    expect(resolveCursorModelForCli('composer-2-fast')).toBe('composer-2-fast');
    expect(resolveCursorModelForCli('auto')).toBe('auto');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveCursorModelForCli('  composer-2  ')).toBe('composer-2');
    expect(resolveCursorModelForCli('  cursor:composer-2  ')).toBe('composer-2');
  });

  it('returns undefined for empty input', () => {
    expect(resolveCursorModelForCli(undefined)).toBeUndefined();
    expect(resolveCursorModelForCli('')).toBeUndefined();
    expect(resolveCursorModelForCli('   ')).toBeUndefined();
  });

  it('returns undefined when only the prefix is present', () => {
    expect(resolveCursorModelForCli('cursor:')).toBeUndefined();
    expect(resolveCursorModelForCli('cursor:   ')).toBeUndefined();
  });
});

describe('resolveCursorModelSelectionForCli', () => {
  it('returns undefined for an empty model', () => {
    expect(resolveCursorModelSelectionForCli(undefined, 'thinking')).toBeUndefined();
  });

  it('returns the bare family for the standard mode', () => {
    expect(resolveCursorModelSelectionForCli('cursor:sonnet-4', 'standard')).toBe('sonnet-4');
    expect(resolveCursorModelSelectionForCli('cursor:sonnet-4', undefined)).toBe('sonnet-4');
  });

  it('appends a curated-suffix mode even when not in cache', () => {
    expect(resolveCursorModelSelectionForCli('cursor:sonnet-4', 'thinking')).toBe('sonnet-4-thinking');
  });

  it('passes auto through unchanged', () => {
    expect(resolveCursorModelSelectionForCli('cursor:auto', 'thinking')).toBe('auto');
  });

  it('falls back to the first valid variant when standard is requested but no bare family exists', () => {
    // Seed the catalog with a family that has no bare id so the runtime cannot
    // legitimately send `--model claude-opus-4-7` (cursor-agent rejects it).
    resetCursorModelCatalog();
    const cachedSeed = [
      'claude-opus-4-7-low',
      'claude-opus-4-7-medium',
      'claude-opus-4-7-high',
    ];
    seedCursorModelCatalogForTest(cachedSeed);

    expect(resolveCursorModelSelectionForCli('cursor:claude-opus-4-7', undefined))
      .toBe('claude-opus-4-7-low');
    expect(resolveCursorModelSelectionForCli('cursor:claude-opus-4-7', 'standard'))
      .toBe('claude-opus-4-7-low');

    resetCursorModelCatalog();
  });

  it('maps claude-opus-4-8 + max to a runnable variant from enabled models', () => {
    resetCursorModelCatalog();
    seedCursorModelCatalogForTest(['auto', 'composer-2']);
    const enabled = [
      'claude-opus-4-8-low',
      'claude-opus-4-8-medium',
      'claude-opus-4-8-max',
    ];

    expect(resolveCursorModelSelectionForCli('cursor:claude-opus-4-8', 'max', enabled))
      .toBe('claude-opus-4-8-max');

    resetCursorModelCatalog();
  });

  it('remaps claude-opus-4-8 to claude-4.8-opus when enabled ids use the new taxonomy', () => {
    resetCursorModelCatalog();
    seedCursorModelCatalogForTest(['auto']);
    const context = {
      catalogIds: ['auto'],
      enabledIds: ['claude-4.8-opus-max', 'claude-4.8-opus-high'],
    };

    expect(resolveCursorModelSelectionForCli('cursor:claude-opus-4-8', 'max', context))
      .toBe('claude-4.8-opus-max');

    resetCursorModelCatalog();
  });

  it('does not emit a bare family id when only suffixed variants are enabled', () => {
    resetCursorModelCatalog();
    seedCursorModelCatalogForTest(['claude-opus-4-8', 'auto']);
    const context = {
      catalogIds: ['claude-opus-4-8', 'auto'],
      enabledIds: ['claude-opus-4-8-max', 'claude-opus-4-8-high'],
    };

    expect(resolveCursorModelSelectionForCli('cursor:claude-opus-4-8', 'standard', context))
      .toBe('claude-opus-4-8-high');
    expect(resolveCursorModelSelectionForCli('cursor:claude-opus-4-8', 'max', context))
      .toBe('claude-opus-4-8-max');

    resetCursorModelCatalog();
  });
});

describe('resolveCursorEffortForFamily', () => {
  const uiConfig = {
    getReasoningOptions: () => [{ value: CURSOR_STANDARD_MODE, label: 'Standard' }],
    getDefaultReasoningValue: () => CURSOR_STANDARD_MODE,
  };

  afterEach(() => {
    resetCursorModelCatalog();
  });

  it('keeps a valid effort when the family offers that mode', () => {
    const ui = {
      getReasoningOptions: () => [
        { value: CURSOR_STANDARD_MODE, label: 'Standard' },
        { value: 'high', label: 'High' },
      ],
      getDefaultReasoningValue: () => CURSOR_STANDARD_MODE,
    };
    expect(resolveCursorEffortForFamily('cursor:gpt-5.4', { effortLevel: 'high' }, ui)).toBe('high');
  });

  it('replaces a stale global effort with the family default', () => {
    resetCursorModelCatalog();
    seedCursorModelCatalogForTest(['gpt-5.6-sol-medium']);
    expect(resolveCursorEffortForFamily(
      toCursorModelValue('gpt-5.6-sol'),
      { effortLevel: 'high', providers: { cursor: { enabledModelsByHost: { host: ['gpt-5.6-sol-medium'] } } } },
      uiConfig,
    )).toBe(CURSOR_STANDARD_MODE);
  });
});

describe('shouldAllowFamilyWireFallback', () => {
  const uiConfig = {
    getReasoningOptions: () => [{ value: CURSOR_STANDARD_MODE, label: 'Standard' }],
  };

  it('allows fallback when the resolved suffix is not offered for the family', () => {
    expect(shouldAllowFamilyWireFallback(
      'gpt-5.6-sol-high',
      toCursorModelValue('gpt-5.6-sol'),
      {},
      uiConfig,
    )).toBe(true);
  });

  it('blocks fallback when the suffix matches a picker variant', () => {
    const ui = {
      getReasoningOptions: () => [
        { value: CURSOR_STANDARD_MODE, label: 'Standard' },
        { value: 'medium', label: 'Medium' },
      ],
    };
    expect(shouldAllowFamilyWireFallback(
      'gpt-5.4-medium',
      toCursorModelValue('gpt-5.4'),
      {},
      ui,
    )).toBe(false);
  });
});
