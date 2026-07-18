import { Notice, TFile } from 'obsidian';

import type SpecoratorPlugin from '../../../main';
import { createWorkOrderFromSeed } from '../commands/taskCommands';
import type { TaskNoteStore } from '../storage/TaskNoteStore';
import { TemplateNoteStore } from '../templates/TemplateNoteStore';
import { WorkOrderChainCoordinator } from './WorkOrderChainCoordinator';

/**
 * Builds the plugin's single `WorkOrderChainCoordinator`, wiring its deps against
 * the live plugin (vault I/O, settings, agent-run-target resolution) and the
 * `noteStore` instance `main.ts` shares with `CommitOnAcceptCoordinator`. Lifted out
 * of `onload` so `main.ts` reads as orchestration (mirrors `registerPluginViews.ts`);
 * the caller still owns `start()`/`stop()`/disposal.
 */
export function createWorkOrderChainCoordinator(
  plugin: SpecoratorPlugin,
  noteStore: TaskNoteStore,
): WorkOrderChainCoordinator {
  return new WorkOrderChainCoordinator({
    events: plugin.events,
    loadTaskSpec: async (path) => {
      const file = plugin.app.vault.getAbstractFileByPath(path);
      if (!file || !('vault' in file)) {
        throw new Error('Work order file not found');
      }
      const content = await plugin.app.vault.read(file as Parameters<typeof plugin.app.vault.read>[0]);
      return noteStore.parse(path, content).task;
    },
    listTemplates: async () => {
      const folder = plugin.settings.agentBoardTemplateFolder || 'Agent Board/templates';
      const { templates } = await new TemplateNoteStore().list(plugin.app.vault, folder);
      return templates;
    },
    createSuccessor: async (plan) => {
      // Seed the chain context (+ objective override) INSIDE the single create
      // write via postProcess, so the note is never `ready`-but-un-seeded for the
      // auto-run queue to race (spec §Successor creation Step 2).
      const seedContent = (markdown: string): string => {
        let next = noteStore.writeChainContext(markdown, {
          predecessorPath: plan.predecessorPath,
          nextAction: plan.nextAction,
        });
        if (plan.seed.objective) {
          next = noteStore.writeSections(next, { objective: plan.seed.objective });
        }
        return next;
      };
      // Agent-only predecessor (roster agent, no explicit provider/model): resolve the
      // agent's backend so the successor gets a concrete, queue-eligible provider/model
      // matching the assigned agent — NOT the board defaults. Mirrors
      // TaskRunCoordinator.resolveRunProviderModel; without this, an inline chain from
      // an agent-only work order would run on board defaults (or fail creation).
      let provider = plan.seed.provider;
      let model = plan.seed.model;
      const agentId = plan.seed.agent;
      if ((!provider || !model) && agentId?.startsWith('roster:')) {
        const target = await plugin.resolveAgentRunTarget(agentId);
        if (target) {
          provider = provider ?? target.providerId;
          model = model ?? target.model;
        }
      }
      const created = await createWorkOrderFromSeed(
        plugin,
        {
          title: plan.seed.title,
          titleOverride: plan.seed.titleOverride,
          objective: plan.seed.objective,
          provider,
          model,
          agent: plan.seed.agent,
          chain: plan.seed.chain,
          chainedFrom: plan.seed.chainedFrom,
          chainDepth: plan.seed.chainDepth,
        },
        { template: plan.template, status: 'ready', reveal: 'none', postProcess: seedContent },
      );
      if (!(created instanceof TFile)) return null;
      const content = await plugin.app.vault.read(created);
      return noteStore.parse(created.path, content).task;
    },
    markChained: async (predecessorPath, successorId) => {
      const file = plugin.app.vault.getAbstractFileByPath(predecessorPath);
      if (!(file instanceof TFile)) return;
      // ONE atomic vault.process transform stamping chained_to — the chain's durable
      // audit trail is frontmatter-only (chained_to / chained_from / chain_depth), never
      // the note's Run Ledger region (writeLedgerSnapshot replaces that wholesale at
      // terminal via RunSession.finalizeLedgerToNote on the `review` trigger, which would
      // erase a line appended here first). vault.process still serializes with that
      // terminal finalization, so this write is never lost to a read+modify race.
      await plugin.app.vault.process(file, (content) =>
        noteStore.writeChainLink(content, successorId, new Date().toISOString()));
    },
    readSettings: () => plugin.settings,
    logger: plugin.logger.scope('tasks.chain'),
    showNotice: (message) => { new Notice(message); },
  });
}
