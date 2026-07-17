// src/features/tasks/model/workOrderChain.ts

/** When the successor is created: after the human accepts (done) or the instant the agent hands off (review). */
export type ChainTrigger = 'done' | 'review';

export const DEFAULT_CHAIN_TRIGGER: ChainTrigger = 'done';

/**
 * A work order's successor configuration. A work order is a "workflow work-order"
 * exactly when this parses non-null — i.e. any of template/title/objective is set.
 * `chained_from` / `chained_to` / `chain_depth` are provenance, not part of this
 * config, and are threaded separately through creation.
 */
export interface WorkOrderChainConfig {
  template?: string;
  title?: string;
  objective?: string;
  trigger: ChainTrigger;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readTrigger(value: unknown): ChainTrigger {
  return value === 'review' ? 'review' : DEFAULT_CHAIN_TRIGGER;
}

/**
 * Parse the `chain_*` frontmatter into a config, or null when no successor is
 * configured. Objective-only counts as configured — creation supplies a fallback
 * title — so a saved objective-only chain still spawns.
 */
export function parseChainConfig(fm: Record<string, unknown>): WorkOrderChainConfig | null {
  const template = readString(fm.chain_template);
  const title = readString(fm.chain_title);
  const objective = readString(fm.chain_objective);
  if (!template && !title && !objective) {
    return null;
  }
  const config: WorkOrderChainConfig = { trigger: readTrigger(fm.chain_trigger) };
  if (template) config.template = template;
  if (title) config.title = title;
  if (objective) config.objective = objective;
  return config;
}

/**
 * Render the chain-config frontmatter lines (omitted keys → no line), for the
 * hand-written YAML builder in `taskCommands.workOrderFrontmatter`. Mirrors the
 * existing `loopLine`/`agentLine` conditional-append pattern.
 */
export function chainConfigFrontmatterLines(config: WorkOrderChainConfig): string[] {
  const lines: string[] = [];
  if (config.template) lines.push(`chain_template: ${JSON.stringify(config.template)}`);
  if (config.title) lines.push(`chain_title: ${JSON.stringify(config.title)}`);
  if (config.objective) lines.push(`chain_objective: ${JSON.stringify(config.objective)}`);
  lines.push(`chain_trigger: ${config.trigger}`);
  return lines;
}
