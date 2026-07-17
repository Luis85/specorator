import type { TaskEventMap } from '../events';
import { parseHandoffSections } from '../model/handoffSections';
import type { TaskLedgerEntry, TaskSpec, TaskStatus } from '../model/taskTypes';
import { parseChainConfig, type WorkOrderChainConfig } from '../model/workOrderChain';
import type { WorkOrderTemplate } from '../templates/templateTypes';

export interface ChainLogger {
  debug(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** The resolved instruction to create a successor (or a reason to skip). */
export interface SuccessorSeed {
  titleOverride?: string;
  title: string;
  objective?: string;
  provider?: string;
  model?: string;
  agent?: string;
  status: 'ready';
  chain?: WorkOrderChainConfig;
  chainedFrom: string;
  chainDepth: number;
}

export type SuccessorPlan =
  | { kind: 'skip'; reason: string }
  | { kind: 'create'; seed: SuccessorSeed; template?: WorkOrderTemplate; predecessorPath: string; nextAction: string };

const TRIGGER_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['review', 'done']);

/**
 * Pure decision: given a predecessor that just entered `enteredStatus`, its resolved
 * template (undefined when none/missing), and the depth cap, decide whether to spawn
 * a successor and with what seed. All guards (config present, trigger match, already
 * chained, depth) are evaluated here so the coordinator stays thin and this is fully
 * unit-testable without vault I/O.
 */
export function buildSuccessorPlan(args: {
  predecessor: TaskSpec;
  enteredStatus: TaskStatus;
  template: WorkOrderTemplate | undefined;
  maxDepth: number;
}): SuccessorPlan {
  const fm: Record<string, unknown> = { ...args.predecessor.frontmatter };
  const config = parseChainConfig(fm);
  if (!config) return { kind: 'skip', reason: 'no chain configured' };
  if (config.trigger !== args.enteredStatus) return { kind: 'skip', reason: 'trigger not met' };
  if (typeof fm.chained_to === 'string' && fm.chained_to.length > 0) {
    return { kind: 'skip', reason: 'already chained' };
  }
  const depth = typeof fm.chain_depth === 'number' ? fm.chain_depth : 0;
  if (depth >= args.maxDepth) return { kind: 'skip', reason: `max chain depth (${args.maxDepth}) reached` };

  const nextAction = parseHandoffSections(args.predecessor.sections.handoff).nextAction.trim();
  const template = config.template ? args.template : undefined;
  const seed: SuccessorSeed = {
    titleOverride: config.title,
    title: config.title ?? template?.name ?? `${args.predecessor.frontmatter.title} — next`,
    objective: config.objective,
    status: 'ready',
    chain: template?.chain,
    chainedFrom: args.predecessor.frontmatter.id,
    chainDepth: depth + 1,
  };
  // Inline (no template): carry the predecessor's backend. For an agent-only predecessor
  // (roster agent, no explicit provider/model) these are undefined and the agent is carried;
  // the coordinator wiring (createSuccessor) resolves the agent's backend so the successor
  // stays runnable on the assigned agent rather than the board defaults.
  if (!template) {
    seed.provider = args.predecessor.frontmatter.provider;
    seed.model = args.predecessor.frontmatter.model;
    seed.agent = args.predecessor.frontmatter.agent;
  }
  return { kind: 'create', seed, template, predecessorPath: args.predecessor.path, nextAction };
}

export interface WorkOrderChainDeps {
  events: { on(event: 'task:status-changed', handler: (p: TaskEventMap['task:status-changed']) => void): () => void };
  loadTaskSpec(path: string): Promise<TaskSpec>;
  listTemplates(): Promise<WorkOrderTemplate[]>;
  /** Create the successor note from the plan and return its parsed spec (id + path). */
  createSuccessor(plan: Extract<SuccessorPlan, { kind: 'create' }>): Promise<TaskSpec | null>;
  /** Atomic combined write on the predecessor: stamp `chained_to` AND append the ledger line in ONE vault.process transform, so it can't race RunSession's terminal finalization. */
  linkSuccessor(predecessorPath: string, successorId: string, ledgerEntry: TaskLedgerEntry): Promise<void>;
  /** Append one ledger line to the predecessor via vault.process (atomic). Used for the depth-skip notice. */
  appendLedger(task: TaskSpec, entry: TaskLedgerEntry): Promise<void>;
  readSettings(): { agentBoardMaxChainDepth?: number };
  now(): string;
  logger: ChainLogger;
  showNotice(message: string): void;
}

const DEFAULT_MAX_DEPTH = 25;

/**
 * Plugin-level service (mirrors `CommitOnAcceptCoordinator`): subscribes once to
 * `task:status-changed` and spawns a configured successor when a work order enters
 * `review`/`done` and its trigger matches. A persistent `chained_to` guard plus an
 * in-flight set make it idempotent across manual/queued runs and multiple panes.
 */
export class WorkOrderChainCoordinator {
  private unsubscribe: (() => void) | null = null;
  private readonly inFlight = new Set<string>();

  constructor(private readonly deps: WorkOrderChainDeps) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.deps.events.on('task:status-changed', (payload) => {
      // Fire-and-forget in production (EventBus does not await handlers). The method is
      // public so tests can await it directly and avoid a microtask race on their assertions.
      void this.handleStatusChanged(payload);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async handleStatusChanged(payload: TaskEventMap['task:status-changed']): Promise<void> {
    if (!TRIGGER_STATUSES.has(payload.status)) return;

    // Load + confirm the trigger matches BEFORE reserving the in-flight path. Reserving
    // first (keyed only by path) let a NON-matching event — e.g. a `review` event for a
    // `done`-triggered chain — hold the path and suppress the matching `done` event that
    // arrived while the first handler was still awaiting the load. EventBus.emit does not
    // await handlers, so a back-to-back review→done transition hits exactly that.
    let predecessor: TaskSpec;
    try {
      predecessor = await this.deps.loadTaskSpec(payload.path);
    } catch (error) {
      this.deps.logger.warn('chain skip: load failed', error);
      return;
    }
    const config = parseChainConfig({ ...predecessor.frontmatter });
    if (!config || config.trigger !== payload.status) return;

    // Only a matching event reserves the path. has()+add() is synchronous (no await
    // between), so two concurrent MATCHING events still yield exactly one spawn.
    if (this.inFlight.has(payload.path)) return;
    this.inFlight.add(payload.path);
    try {
      await this.spawnSuccessor(predecessor, payload, config);
    } catch (error) {
      this.deps.logger.error('chain: unexpected failure', error);
    } finally {
      this.inFlight.delete(payload.path);
    }
  }

  /**
   * Resolve the plan and either create the successor or record the skip. Split out of
   * `handleStatusChanged` so that method's own branching (trigger gate + in-flight
   * reserve) stays small enough to clear the fallow complexity ratchet.
   */
  private async spawnSuccessor(
    predecessor: TaskSpec,
    payload: TaskEventMap['task:status-changed'],
    config: WorkOrderChainConfig,
  ): Promise<void> {
    const maxDepth = this.deps.readSettings().agentBoardMaxChainDepth ?? DEFAULT_MAX_DEPTH;
    const template = await this.resolveTemplate(config);

    const plan = buildSuccessorPlan({ predecessor, enteredStatus: payload.status, template, maxDepth });
    if (plan.kind === 'skip') {
      await this.recordSkip(predecessor, payload, plan.reason);
      return;
    }

    const successor = await this.deps.createSuccessor(plan);
    if (!successor) {
      this.deps.logger.warn('chain skip: successor creation returned null');
      return;
    }
    // One atomic write on the predecessor: stamp chained_to AND append the ledger line
    // together, so it can't race RunSession's terminal note finalization (which also
    // writes this note for the `review` trigger).
    await this.deps.linkSuccessor(predecessor.path, successor.frontmatter.id, {
      timestamp: this.deps.now(),
      status: payload.status,
      message: `chain: spawned successor ${successor.frontmatter.id}`,
    });
    this.deps.showNotice(`Chained → "${successor.frontmatter.title}" (ready).`);
  }

  /** Resolve `config.template` by name via `listTemplates()`; notices (not throws) when missing so the chain still spawns a blank successor. */
  private async resolveTemplate(config: WorkOrderChainConfig): Promise<WorkOrderTemplate | undefined> {
    if (!config.template) return undefined;
    const templates = await this.deps.listTemplates();
    const template = templates.find((candidate) => candidate.name === config.template);
    if (!template) {
      this.deps.showNotice(`Chain template "${config.template}" not found; creating a blank successor.`);
    }
    return template;
  }

  /** A depth-cap skip is user-visible (notice + ledger line); every other skip reason is a silent debug log. */
  private async recordSkip(
    predecessor: TaskSpec,
    payload: TaskEventMap['task:status-changed'],
    reason: string,
  ): Promise<void> {
    if (!reason.includes('depth')) {
      this.deps.logger.debug(`chain skip: ${reason}`);
      return;
    }
    this.deps.showNotice(`Work order "${predecessor.frontmatter.title}": ${reason}.`);
    await this.deps.appendLedger(predecessor, {
      timestamp: this.deps.now(),
      status: payload.status,
      message: `chain: ${reason}`,
    });
  }
}
