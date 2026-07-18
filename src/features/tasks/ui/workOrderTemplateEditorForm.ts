import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { LoopNoteStore } from '../loops/LoopNoteStore';
import type { TaskPriority } from '../model/taskTypes';
import {
  type ChainTrigger,
  parseChainConfig,
  type WorkOrderChainConfig,
} from '../model/workOrderChain';
import { type SaveTemplateInput,TemplateNoteStore } from '../templates/TemplateNoteStore';
import type { WorkOrderTemplate } from '../templates/templateTypes';

// Pure form data + option/payload helpers for the work-order template editor.
// Extracted from the imperative `WorkOrderTemplateEditorModal` so the Vue island
// (`vue/WorkOrderTemplateEditorRoot.vue`) and the thin modal shell share one
// source of truth (mirrors how the detail modal split `workOrderEditForm.ts`).

export interface WorkOrderTemplateEditorPayload extends SaveTemplateInput {
  originalPath?: string;
}

export interface TemplateEditorOption {
  value: string;
  label: string;
}

/** Mutable editor form state. Optional template fields use '' to mean "unset". */
export interface TemplateEditorForm {
  name: string;
  description: string;
  icon: string;
  provider: string;
  model: string;
  priority: '' | TaskPriority;
  loop: string;
  agent: string;
  body: string;
  /** Default-successor fields; a blank trigger resolves to `DEFAULT_CHAIN_TRIGGER` on save. */
  chainTemplate: string;
  chainTitle: string;
  chainObjective: string;
  chainTrigger: '' | ChainTrigger;
}

// `null` label means "Use default", resolved through i18n at render time so the
// option text follows the active locale (a module-level `t()` would freeze it).
export const PRIORITY_OPTIONS: Array<{ value: '' | TaskPriority; label: string | null }> = [
  { value: '', label: null },
  { value: '0 - urgent', label: '0 - urgent' },
  { value: '1 - high', label: '1 - high' },
  { value: '2 - normal', label: '2 - normal' },
  { value: '3 - low', label: '3 - low' },
];

/** The four default-successor fields, split out so `createInitialForm` keeps its own complexity flat. */
type ChainFormFields = Pick<TemplateEditorForm, 'chainTemplate' | 'chainTitle' | 'chainObjective' | 'chainTrigger'>;

function initialChainFields(existing: WorkOrderTemplate | null): ChainFormFields {
  return {
    chainTemplate: existing?.chain?.template ?? '',
    chainTitle: existing?.chain?.title ?? '',
    chainObjective: existing?.chain?.objective ?? '',
    chainTrigger: existing?.chain?.trigger ?? '',
  };
}

/** Seed the editable form from the existing template (or blank defaults for a new one). */
export function createInitialForm(existing: WorkOrderTemplate | null): TemplateEditorForm {
  return {
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    icon: existing?.icon ?? '',
    provider: existing?.provider ?? '',
    model: existing?.model ?? '',
    priority: existing?.priority ?? '',
    loop: existing?.loop ?? '',
    agent: existing?.agent ?? '',
    body: existing?.body ?? defaultBody(),
    ...initialChainFields(existing),
  };
}

/**
 * Collapse the form's chain fields into a `WorkOrderChainConfig`, or `undefined`
 * when no successor is configured. Delegates to the canonical `parseChainConfig`
 * (same trimming, all-blank → none, and blank-trigger → default) by mapping the
 * form fields onto the `chain_*` keys it reads — one source of truth for the
 * predicate, and it keeps `buildTemplatePayload` under the complexity ratchet.
 */
function buildTemplateChain(form: TemplateEditorForm): WorkOrderChainConfig | undefined {
  return parseChainConfig({
    chain_template: form.chainTemplate,
    chain_title: form.chainTitle,
    chain_objective: form.chainObjective,
    chain_trigger: form.chainTrigger,
  }) ?? undefined;
}

/**
 * Build the save payload from the form: name/body trimmed (validation happens
 * upstream), every optional field trimmed with '' collapsing to `undefined`, and
 * `originalPath` carried through so an edit overwrites the source note in place.
 */
export function buildTemplatePayload(
  form: TemplateEditorForm,
  originalPath?: string,
): WorkOrderTemplateEditorPayload {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    icon: form.icon.trim() || undefined,
    provider: form.provider.trim() || undefined,
    model: form.model.trim() || undefined,
    priority: form.priority || undefined,
    loop: form.loop.trim() || undefined,
    agent: form.agent.trim() || undefined,
    body: form.body.trim(),
    chain: buildTemplateChain(form),
    originalPath,
  };
}

export function providerOptionList(settings: Record<string, unknown>): TemplateEditorOption[] {
  const options: TemplateEditorOption[] = [{ value: '', label: t('tasks.templateEditor.useDefault') }];
  for (const id of ProviderRegistry.getRegisteredProviderIds()) {
    if (ProviderRegistry.isEnabled(id, settings)) {
      options.push({ value: id, label: id });
    }
  }
  return options;
}

export function modelOptionList(
  providerId: string,
  settings: Record<string, unknown>,
): TemplateEditorOption[] {
  const options: TemplateEditorOption[] = [{ value: '', label: t('tasks.templateEditor.useDefault') }];
  if (!providerId) {
    return options;
  }
  const registered = ProviderRegistry.getRegisteredProviderIds() as readonly string[];
  if (!registered.includes(providerId)) {
    return options;
  }
  try {
    const config = ProviderRegistry.getChatUIConfig(providerId);
    for (const opt of config.getModelOptions(settings)) {
      options.push({ value: opt.value, label: opt.label });
    }
  } catch {
    // Provider may not expose model options synchronously; fall back to default-only.
  }
  return options;
}

/**
 * Loop options (`{ value: id, label: name }`) for the default-loop select. An
 * unknown stored loop id is preserved via the form's v-model ref (no explicit
 * option needed) — parity with the imperative `populateLoopOptions`, which also
 * added no fallback option for a stale id.
 */
export async function loadLoopOptions(plugin: SpecoratorPlugin): Promise<TemplateEditorOption[]> {
  const folder = plugin.settings.agentBoardLoopFolder || 'Agent Board/loops';
  const { loops } = await new LoopNoteStore().list(plugin.app.vault, folder);
  return loops.map((loop) => ({ value: loop.id, label: loop.name }));
}

/**
 * Template names for the default-successor picker, keyed by name (the chain config
 * references a template by name, mirroring `chain_template`). Excludes the currently
 * edited template so a template cannot trivially chain to itself. An unknown stored
 * name is preserved via the form's v-model ref, same as `loadLoopOptions`.
 */
export async function loadTemplateNameOptions(
  plugin: SpecoratorPlugin,
  currentName: string,
): Promise<TemplateEditorOption[]> {
  const folder = plugin.settings.agentBoardTemplateFolder || 'Agent Board/templates';
  const { templates } = await new TemplateNoteStore().list(plugin.app.vault, folder);
  return templates
    .filter((tpl) => tpl.name !== currentName)
    .map((tpl) => ({ value: tpl.name, label: tpl.name }));
}

/**
 * Roster-agent options for the agent select. Preserves an unknown stored id
 * (e.g. an agent deleted after assignment) so a save that never touches the
 * dropdown does not silently drop it — parity with `populateAgentOptions`.
 */
export async function loadAgentOptions(
  plugin: SpecoratorPlugin,
  current: string,
): Promise<TemplateEditorOption[]> {
  const agents = (await plugin.agentRosterStore?.list()) ?? [];
  const options = agents.map((agent) => ({ value: agent.id, label: agent.name }));
  if (current && !agents.some((agent) => agent.id === current)) {
    options.push({ value: current, label: current });
  }
  return options;
}

function defaultBody(): string {
  return [
    '# {{title}}',
    '',
    '## Objective',
    '',
    '_Describe what the agent should accomplish._',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] _Define what "done" means._',
    '',
    '## Context',
    '',
    '{{source}}',
    '',
    '## Constraints',
    '',
    '- Do not modify unrelated files.',
    '',
  ].join('\n');
}
