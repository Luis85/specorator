import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import type { TaskSpec } from '../model/taskTypes';
import { applyChainConfigToFrontmatter, parseChainConfig, type WorkOrderChainConfig } from '../model/workOrderChain';
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
 * Apply `applyChainConfigToFrontmatter`'s set/clear semantics onto the
 * in-memory task snapshot shared by reference with the Vue detail modal (the
 * callback is invoked with the modal's own `task`, not a copy). Without this,
 * `chainFrontmatter` above keeps reading the pre-save keys until the board's
 * next vault-modify re-index replaces this `TaskSpec` — so reopening "Next
 * step" in the same session would prefill from the stale config and a second
 * Save could silently clobber the config just written. Same class of problem
 * `WorkOrderProperties.vue`'s `pickLoop()` solves for `frontmatter.loop`;
 * unlike `loop`, `chain_*` has no typed `TaskFrontmatter` field (a
 * loosely-typed extension bag throughout this feature — see `chainFrontmatter`
 * above and `WorkOrderChainCoordinator`'s `chained_to`/`chain_depth` reads),
 * so the sync goes through the same cast rather than a direct assignment.
 */
function syncChainFrontmatter(task: TaskSpec, chain: WorkOrderChainConfig | null): void {
  applyChainConfigToFrontmatter(task.frontmatter as unknown as Record<string, unknown>, chain);
}

/** The label alone, before the trigger suffix — title > template > (truncated) objective > "None". */
function chainLabelFromFields(config: WorkOrderChainConfig): string {
  if (config.title) return config.title;
  if (config.template) return config.template;
  if (config.objective) {
    return config.objective.length > OBJECTIVE_LABEL_MAX
      ? `${config.objective.slice(0, OBJECTIVE_LABEL_MAX - 1)}…`
      : config.objective;
  }
  return t('tasks.chainConfig.chipNone');
}

/**
 * Chip label for a parsed config. Objective-only chains are valid (Task 1's
 * `parseChainConfig` treats an objective alone as configured), so fall back to
 * the (truncated) objective before "None" — never show "None" for a configured
 * chain. Appends the on-handoff suffix for the `review` trigger so the chip
 * communicates the successor's create-time, not just its content (plan Task 9
 * Step 4); the separator is punctuation, not translated text, so only the
 * suffix words route through `t()`.
 */
export function chainSummaryFromConfig(config: WorkOrderChainConfig): string {
  const label = chainLabelFromFields(config);
  return config.trigger === 'review' ? `${label} · ${t('tasks.chainConfig.onHandoffSuffix')}` : label;
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
  syncChainFrontmatter(task, result);
  return result ? chainSummaryFromConfig(result) : t('tasks.chainConfig.chipNone');
}

/**
 * Loop deps needed to fold `AgentBoardView`'s `getLoopName`/`onPickLoop` wiring
 * into the shared bundle below. Optional at the call site: only `AgentBoardView`
 * wires a loop picker into this modal today — `WorkOrderActivityProvider`'s
 * fallback modal omits it, and passing no `loopDeps` there keeps that call site
 * un-changed (no dead callbacks gained).
 */
export interface ChainDetailLoopDeps {
  loopNameCache: Map<string, string>;
  pickLoopForTask: (task: TaskSpec) => Promise<string | undefined>;
}

/**
 * The `onConfigureChain` / `getChainSummary` callback pair — plus, when
 * `loopDeps` is supplied, `getLoopName` / `onPickLoop` — bundled for a single
 * spread at each `WorkOrderDetailModalCallbacks` call site (same shape as
 * `buildWorkOrderFieldOptions`).
 */
export function buildChainDetailCallbacks(
  plugin: SpecoratorPlugin,
  saveFields: (task: TaskSpec, fields: WorkOrderFieldUpdate) => Promise<void>,
  loopDeps?: ChainDetailLoopDeps,
): Pick<WorkOrderDetailModalCallbacks, 'onConfigureChain' | 'getChainSummary' | 'getLoopName' | 'onPickLoop'> {
  return {
    onConfigureChain: (task) => configureChainForTask(plugin, task, saveFields),
    getChainSummary: (task) => chainSummaryForTask(task),
    getLoopName: loopDeps ? (loopId) => (loopId ? loopDeps.loopNameCache.get(loopId) : undefined) : undefined,
    onPickLoop: loopDeps ? (task) => loopDeps.pickLoopForTask(task) : undefined,
  };
}
