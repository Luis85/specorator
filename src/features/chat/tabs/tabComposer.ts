import type {
  ProviderCapabilities,
  ProviderChatUIConfig,
  ProviderIconSvg,
  ProviderPermissionModeToggleConfig,
  ProviderReasoningOption,
} from '../../../core/providers/types';
import type { UsageInfo } from '../../../core/types';
import type SpecoratorPlugin from '../../../main';
import type { ToolbarSettings } from '../ui/toolbar/shared';
import { formatTokens } from '../ui/toolbar/shared';
import type { ComposerSnapshot, ComposerSubscribe } from '../ui/vue/composer/composerCallbacks';
import type {
  ComposerChips,
  ComposerDraftMeta,
  ComposerDropdownState,
  ComposerEditedFile,
  ComposerExternalContextState,
  ComposerFileChip,
  ComposerFolderChip,
  ComposerImageChip,
  ComposerInputMode,
  ComposerMcpState,
  ComposerModelGroup,
  ComposerModeState,
  ComposerPermissionState,
  ComposerPlanModeState,
  ComposerReasoningState,
  ComposerServiceTierState,
  ComposerStreamingState,
  ComposerToolbarState,
  ComposerUsageState,
  ComposerWrapperMode,
} from '../ui/vue/composer/stores/composerStore';
import { formatImageSize, resolveImageAttachmentSrc } from '../utils/imageAttachment';
import { basename, parentDir } from '../utils/pathLabel';
import { getBlankTabModelOptions } from './tabModelPolicy';
import { getProviderMcpManager, getTabCapabilities, getTabChatUIConfig, getTabPermissionMode } from './tabShared';
import { getComposerToolbarSettings } from './tabUi';
import type { TabData } from './types';

const EMPTY_DROPDOWN: ComposerDropdownState = { kind: null, items: [], activeIndex: 0, anchorRect: null };

/**
 * Per-tab projection source for the Vue composer island. Mirrors
 * `TabTranscriptProjection`: the engine mutates its own state (InputController,
 * ChatState, the toolbar-setting owners, the mode managers); this pushes a
 * fully-projected {@link ComposerSnapshot} to every observer registered through
 * {@link subscribe}. Slice builders are filled in per migration phase — Phase 1
 * projects send/inputMode/draftMeta; toolbar/chips/editedFiles/dropdown are
 * empty until their phases wire them.
 */
export class TabComposerProjection {
  private readonly observers = new Set<(s: ComposerSnapshot) => void>();

  constructor(
    private readonly tab: TabData,
    private readonly plugin: SpecoratorPlugin,
  ) {}

  readonly subscribe: ComposerSubscribe = (onChange) => {
    this.observers.add(onChange);
    onChange(this.snapshot());
    return () => {
      this.observers.delete(onChange);
    };
  };

  /** Re-projects and fans to every observer. No-op when nothing is mounted. */
  emit(): void {
    if (this.observers.size === 0) return;
    const snapshot = this.snapshot();
    for (const observer of this.observers) observer(snapshot);
  }

  private snapshot(): ComposerSnapshot {
    return {
      toolbar: this.buildToolbar(),              // Phase 2
      chips: this.buildChips(),                  // Phase 3
      editedFiles: this.buildEditedFiles(),      // Phase 3
      streaming: this.buildStreaming(),          // Phase 1
      dropdown: this.buildDropdown(),            // Phase 5
      inputMode: this.buildInputMode(),          // Phase 1
      draftMeta: this.buildDraftMeta(),          // Phase 1
      wrapperMode: this.buildWrapperMode(),      // Phase 1 (wrapper mode classes)
    };
  }

  // --- Phase 1 slices -------------------------------------------------------

  private buildStreaming(): ComposerStreamingState {
    return { isStreaming: this.tab.state.isStreaming };
  }

  // Vue owns the three wrapper-mode classes; the engine no longer toggles them
  // (Task 4 / Task 5b remove the imperative classList.toggle sites). planMode
  // derives from the permission mode gated by plan support; instruction /
  // bang-bash derive live from the mode managers' isActive().
  private buildWrapperMode(): ComposerWrapperMode {
    return {
      planMode: getTabPermissionMode(this.tab, this.plugin) === 'plan'
        && getTabCapabilities(this.tab, this.plugin).supportsPlanMode,
      instructionMode: this.tab.ui.instructionModeManager?.isActive() ?? false,
      bangBashMode: this.tab.ui.bangBashModeManager?.isActive() ?? false,
    };
  }

  private buildInputMode(): ComposerInputMode {
    if (this.tab.ui.instructionModeManager?.isActive()) return 'instruction';
    if (this.tab.ui.bangBashModeManager?.isActive()) return 'bang-bash';
    return 'none';
  }

  private buildDraftMeta(): ComposerDraftMeta {
    const isEmpty = (this.tab.dom.inputEl?.value ?? '').trim().length === 0;
    return { isEmpty, activeMode: this.buildInputMode() };
  }

  // --- Phase 2 slice --------------------------------------------------------

  private buildToolbar(): ComposerToolbarState {
    const tab = this.tab;
    const plugin = this.plugin;
    const settings = getComposerToolbarSettings(tab, plugin);
    const caps = getTabCapabilities(tab, plugin);
    const uiConfig = getTabChatUIConfig(tab, plugin);

    // Model options (blank tabs mix providers via getBlankTabModelOptions).
    const modelOptions = tab.lifecycleState === 'blank'
      ? getBlankTabModelOptions(plugin.settings)
      : uiConfig.getModelOptions({ ...settings, environmentVariables: plugin.getActiveEnvironmentVariables() });
    const modelGroups = groupModelOptions(modelOptions, uiConfig);
    const modelLabel = modelOptions.find((o) => o.value === settings.model)?.label ?? settings.model;

    const permConfig = uiConfig.getPermissionModeToggle?.() ?? null;

    // Each widget slice mirrors its imperative counterpart's render logic; the
    // per-slice branch logic lives in the builders below so this stays flat.
    return {
      modelLabel,
      modelGroups,
      mode: buildModeState(uiConfig, settings),
      reasoning: buildReasoningState(caps, uiConfig, settings),
      serviceTier: buildServiceTierState(uiConfig, settings),
      permission: permConfig ? buildPermissionState(permConfig, settings, caps) : null,
      planMode: buildPlanModeState(permConfig, settings, caps),
      mcp: buildMcpState(tab, caps),
      externalContext: buildExternalContextState(tab),
      usage: buildUsageState(tab.state.usage),
    };
  }

  // --- Deferred slices (return empties until their phase fills them) ---------

  // The current note is projected as its OWN `currentNote` field and de-duped OUT
  // of `files` (mirrors FileChipsView). Images are keyed by generated `id`
  // (Map<id, …>) and `ImageAttachment.path` is optional (stamped on send), so an
  // image chip carries `id` and is removable ONLY by id — never by path.
  private buildChips(): ComposerChips {
    const fc = this.tab.ui.fileContextManager;
    const currentPath = fc?.getCurrentNotePath() ?? null;
    const currentNote: ComposerFileChip | null = currentPath
      ? { path: currentPath, label: basename(currentPath), kind: 'current' }
      : null;
    const files: ComposerFileChip[] = [];
    for (const p of fc?.getAttachedFiles() ?? new Set<string>()) {
      if (p === currentPath) continue; // the current note renders once, as currentNote
      files.push({ path: p, label: basename(p), kind: 'file' });
    }
    const folders: ComposerFolderChip[] = [];
    for (const p of fc?.getAttachedFolders() ?? new Set<string>()) {
      folders.push({ path: p, label: `${basename(p)}/` });
    }
    const images: ComposerImageChip[] = (this.tab.ui.imageContextManager?.getAttachedImages() ?? []).map((img) => ({
      id: img.id,
      name: img.name,
      sizeLabel: formatImageSize(img.size),
      src: resolveImageAttachmentSrc(this.plugin.app, img) ?? '',
    }));
    return { currentNote, files, folders, images };
  }

  private buildEditedFiles(): ComposerEditedFile[] {
    return (this.tab.state.editedFiles ?? []).map((e) => ({
      path: e.path,
      changeKind: e.changeKind,
      name: basename(e.path),
      dir: parentDir(e.path),
    }));
  }

  private buildDropdown(): ComposerDropdownState { return EMPTY_DROPDOWN; }
}

function groupModelOptions(
  options: Array<{ value: string; label: string; group?: string; providerIcon?: ProviderIconSvg }>,
  uiConfig: ProviderChatUIConfig,
): ComposerModelGroup[] {
  const groups: ComposerModelGroup[] = [];
  const byGroup = new Map<string | null, ComposerModelGroup>();
  for (const o of options) {
    const key = o.group ?? null;
    let g = byGroup.get(key);
    if (!g) { g = { label: key, options: [] }; byGroup.set(key, g); groups.push(g); }
    g.options.push({ value: o.value, label: o.label, providerIcon: o.providerIcon ?? uiConfig.getProviderIcon?.() ?? undefined });
  }
  return groups;
}

// Mode switch is visible only with exactly two options (mirrors ModeSelector).
function buildModeState(uiConfig: ProviderChatUIConfig, settings: ToolbarSettings): ComposerModeState | null {
  const modeConfig = uiConfig.getModeSelector?.(settings) ?? null;
  if (!modeConfig || modeConfig.options.length !== 2) return null;
  return {
    label: modeConfig.label, value: modeConfig.value, activeValue: modeConfig.activeValue ?? '',
    active: settings[modeConfig.value] === modeConfig.activeValue || modeConfig.value === modeConfig.activeValue,
    title: modeConfig.options.map((o) => o.label).join(' ↔ '),
    options: modeConfig.options.map((o) => ({ value: o.value, label: o.label, description: o.description })),
  };
}

function buildServiceTierState(uiConfig: ProviderChatUIConfig, settings: ToolbarSettings): ComposerServiceTierState | null {
  const tierConfig = uiConfig.getServiceTierToggle?.(settings) ?? null;
  if (!tierConfig) return null;
  return { active: settings.serviceTier === tierConfig.activeValue, activeValue: tierConfig.activeValue, inactiveValue: tierConfig.inactiveValue };
}

function buildPlanModeState(
  permConfig: ProviderPermissionModeToggleConfig | null, settings: ToolbarSettings, caps: ProviderCapabilities,
): ComposerPlanModeState {
  const planValue = permConfig?.planValue;
  return {
    visible: caps.supportsPlanMode && Boolean(planValue),
    active: Boolean(planValue) && settings.permissionMode === planValue,
  };
}

function buildUsageState(usage: UsageInfo | null | undefined): ComposerUsageState | null {
  if (!usage || usage.contextTokens <= 0) return null;
  return { percentage: usage.percentage, warning: usage.percentage > 80, tooltip: buildUsageTooltip(usage) };
}

// Mirrors ThinkingBudgetSelector: null hides the control entirely (reasoningControl
// 'none' / empty options / lone-default); otherwise returns the option list feeding
// the single visible control. There is NO separate effort-options source.
function resolveReasoningOptions(
  caps: ProviderCapabilities, uiConfig: ProviderChatUIConfig, model: string, settings: ToolbarSettings,
): ProviderReasoningOption[] | null {
  if (caps.reasoningControl === 'none') return null;
  const options = uiConfig.getReasoningOptions?.(model, settings) ?? [];
  if (options.length === 0) return null;
  const def = uiConfig.getDefaultReasoningValue?.(model, settings);
  if (options.length === 1 && options[0].value === def) return null;
  return options;
}

function buildReasoningState(
  caps: ProviderCapabilities, uiConfig: ProviderChatUIConfig, settings: ToolbarSettings,
): ComposerReasoningState | null {
  const model = settings.model;
  const options = resolveReasoningOptions(caps, uiConfig, model, settings);
  if (!options) return null;

  const mapped = options.map((o) => ({ value: o.value, label: o.label, title: o.description }));
  // adaptive → EFFORT gears (persist `effortLevel`); non-adaptive → BUDGET gears
  // (persist `thinkingBudget`). Both fed by the same getReasoningOptions list.
  if (uiConfig.isAdaptiveReasoningModel?.(model, settings) ?? false) {
    const current = resolveReasoningLabel(options, settings.effortLevel);
    return { effort: { label: 'Effort:', current, options: mapped }, budget: null };
  }
  const current = resolveReasoningLabel(options, settings.thinkingBudget);
  return { budget: { label: 'Thinking:', current, options: mapped }, effort: null };
}

function resolveReasoningLabel(options: Array<{ value: string; label: string }>, value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function buildPermissionState(
  permConfig: { activeValue: string; inactiveValue: string; activeLabel: string; inactiveLabel: string; planValue?: string; planLabel?: string },
  settings: ToolbarSettings, caps: ProviderCapabilities,
): ComposerPermissionState {
  const inPlan = Boolean(permConfig.planValue) && settings.permissionMode === permConfig.planValue && caps.supportsPlanMode;
  const active = settings.permissionMode === permConfig.activeValue;
  return {
    visible: true,
    label: inPlan ? (permConfig.planLabel ?? '') : (active ? permConfig.activeLabel : permConfig.inactiveLabel),
    active, planActive: inPlan, switchVisible: !inPlan,
    activeValue: permConfig.activeValue, inactiveValue: permConfig.inactiveValue,
  };
}

function buildMcpState(tab: TabData, caps: ProviderCapabilities): ComposerMcpState {
  if (!caps.supportsMcpTools) return { visible: false, count: 0, servers: [] };
  const manager = getProviderMcpManager(caps.providerId);
  const all = manager?.getServers().filter((s) => s.enabled) ?? [];
  const enabled = tab.ui.mcpServerSelector?.getEnabledServers() ?? new Set<string>();
  return {
    visible: all.length > 0, count: enabled.size,
    servers: all.map((s) => ({ name: s.name, enabled: enabled.has(s.name), contextSaving: Boolean(s.contextSaving) })),
  };
}

function buildExternalContextState(tab: TabData): ComposerExternalContextState {
  const paths = tab.ui.externalContextSelector?.getExternalContexts() ?? [];
  const persistent = new Set(tab.ui.externalContextSelector?.getPersistentPaths() ?? []);
  return {
    count: paths.length,
    items: paths.map((p) => ({ path: p, persistent: persistent.has(p) })),
  };
}

function buildUsageTooltip(usage: UsageInfo): string {
  let tip = `${formatTokens(usage.contextTokens)} / ${formatTokens(usage.contextWindow)}`;
  if (usage.costUsd) tip += ` · $${usage.costUsd.toFixed(4)}`;
  if (usage.percentage > 80) tip += ' (Approaching limit, run `/compact` to continue)';
  return tip;
}
