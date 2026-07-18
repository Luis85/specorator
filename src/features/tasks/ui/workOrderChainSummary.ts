import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import type { TaskSpec } from '../model/taskTypes';
import { parseChainConfig, type WorkOrderChainConfig } from '../model/workOrderChain';
import { chooseChainConfig } from './ChainConfigModal';
import type { WorkOrderDetailModalCallbacks, WorkOrderFieldUpdate } from './WorkOrderDetailModal';

// Shared "Next step" chip label + configure-callback logic for the two editable
// WorkOrderDetailModal call sites (AgentBoardView and WorkOrderActivityProvider),
// so neither drifts from the other (mirrors buildWorkOrderFieldOptions /
// buildWorkOrderConversationBindings, the existing shared-bundle pattern).

// Chip labels truncate a long objective-only chain so the sidebar row stays
// single-line; matches the truncation idiom in commands/taskCommands.ts.
const OBJECTIVE_LABEL_MAX = 40;

/**
 * `TaskFrontmatter` has no index signature, so a direct `as Record<string,
 * unknown>` cast fails TS2352 ("insufficient overlap"); spreading into a
 * freshly-typed object is the same idiom `WorkOrderChainCoordinator` uses.
 */
function chainFrontmatter(task: TaskSpec): Record<string, unknown> {
  return { ...task.frontmatter };
}

/**
 * Chip label for a parsed config. Objective-only chains are valid (Task 1's
 * `parseChainConfig` treats an objective alone as configured), so fall back to
 * the (truncated) objective before "None" — never show "None" for a configured
 * chain.
 */
export function chainSummaryFromConfig(config: WorkOrderChainConfig): string {
  if (config.title) return config.title;
  if (config.template) return config.template;
  if (config.objective) {
    return config.objective.length > OBJECTIVE_LABEL_MAX
      ? `${config.objective.slice(0, OBJECTIVE_LABEL_MAX - 1)}…`
      : config.objective;
  }
  return t('tasks.chainConfig.chipNone');
}

/** Sync summary for the "Next step" chip, reading the task's current `chain_*` frontmatter. */
export function chainSummaryForTask(task: TaskSpec): string {
  const config = parseChainConfig(chainFrontmatter(task));
  return config ? chainSummaryFromConfig(config) : t('tasks.chainConfig.chipNone');
}

/**
 * Open the chain-config modal for `task`, persist the result through the
 * caller's `saveFields` (the same `onSaveFields`-shaped writer each call site
 * already has), and resolve to the new summary label — or `undefined` when
 * cancelled, so the caller's chip can no-op instead of showing "None".
 */
async function configureChainForTask(
  plugin: SpecoratorPlugin,
  task: TaskSpec,
  saveFields: (task: TaskSpec, fields: WorkOrderFieldUpdate) => Promise<void>,
): Promise<string | undefined> {
  const current = parseChainConfig(chainFrontmatter(task)) ?? undefined;
  const result = await chooseChainConfig(plugin, current);
  if (result === undefined) return undefined;
  await saveFields(task, { chain: result });
  return result ? chainSummaryFromConfig(result) : t('tasks.chainConfig.chipNone');
}

/**
 * The `onConfigureChain` / `getChainSummary` callback pair, bundled for a single
 * spread at each `WorkOrderDetailModalCallbacks` call site (same shape as
 * `buildWorkOrderFieldOptions`).
 */
export function buildChainDetailCallbacks(
  plugin: SpecoratorPlugin,
  saveFields: (task: TaskSpec, fields: WorkOrderFieldUpdate) => Promise<void>,
): Pick<WorkOrderDetailModalCallbacks, 'onConfigureChain' | 'getChainSummary'> {
  return {
    onConfigureChain: (task) => configureChainForTask(plugin, task, saveFields),
    getChainSummary: (task) => chainSummaryForTask(task),
  };
}
