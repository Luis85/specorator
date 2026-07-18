import { Notice, TFile, TFolder } from 'obsidian';

import { EventBus } from '@/core/events/EventBus';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type { ProviderChatUIConfig, ProviderRegistration } from '@/core/providers/types';
import { createWorkOrderFromSeed } from '@/features/tasks/commands/taskCommands';
import type { TaskEventMap } from '@/features/tasks/events';
import { WorkOrderChainCoordinator } from '@/features/tasks/execution/WorkOrderChainCoordinator';
import { chainConfigFrontmatterLines, type WorkOrderChainConfig } from '@/features/tasks/model/workOrderChain';
import {
  CONTEXT_PLACEHOLDER,
  HANDOFF_END,
  HANDOFF_START,
  RUN_LEDGER_END,
  RUN_LEDGER_START,
  TaskNoteStore,
} from '@/features/tasks/storage/TaskNoteStore';
import { TemplateNoteStore } from '@/features/tasks/templates/TemplateNoteStore';
import type { WorkOrderTemplate } from '@/features/tasks/templates/templateTypes';
import type SpecoratorPlugin from '@/main';

/**
 * End-to-end coverage for Task 7 of the work-order-chaining plan: this drives the
 * REAL `WorkOrderChainCoordinator` wired the same way `src/main.ts` wires it —
 * `loadTaskSpec`/`createSuccessor`/`markChained` closures (frontmatter-only audit;
 * there is no `appendLedger` dep) built against a real `TaskNoteStore` and
 * `createWorkOrderFromSeed` — over a hand-rolled in-memory vault. No shared "fake
 * Vault" test helper exists in this repo (every sibling integration test
 * hand-rolls a narrower one), so this file builds its own.
 */

const WORK_ORDER_FOLDER = 'Agent Board/tasks';
const TEMPLATE_FOLDER = 'Agent Board/templates';
const PRED_PATH = `${WORK_ORDER_FOLDER}/task-1.md`;

const HANDOFF_BODY = [
  '## Summary',
  'did the work',
  '## Verification',
  'tests pass',
  '## Risks',
  'None',
  '## Next Action',
  'Ship it',
].join('\n');

/**
 * Minimal Map-backed in-memory vault: just enough of the real `Vault` surface
 * (`getAbstractFileByPath` / `read` / `create` / `createFolder` / `process` /
 * `getMarkdownFiles`) for `createWorkOrderFromSeed`, `TaskNoteStore`, and
 * `TemplateNoteStore.list` to run against real file content instead of
 * call-recording stubs. `create`/`process` are `jest.fn()`-wrapped so tests can
 * inspect what was actually written and how many atomic writes happened.
 */
class FakeVault {
  private readonly files = new Map<string, string>();

  seed(path: string, content: string): void {
    this.files.set(path, content);
  }

  allPaths(): string[] {
    return [...this.files.keys()];
  }

  getContent(path: string): string | undefined {
    return this.files.get(path);
  }

  getAbstractFileByPath = (path: string): TFile | null => {
    if (!this.files.has(path)) return null;
    // Real Obsidian TFile instances carry a `.vault` back-reference; the mocked
    // TFile class does not. The coordinator's `loadTaskSpec` duck-types on
    // `'vault' in file` (mirroring the existing CommitOnAcceptCoordinator wiring,
    // which sidesteps the obsidianmd/no-tfile-tfolder-cast lint rule the same
    // way), so this attaches one to narrow the same way it would in production.
    // Real Obsidian's ambient `TFile` type declares no public constructor
    // (implicit zero-arg), so — like templateTitle.test.ts / defaultProvider.test.ts —
    // this constructs with no args and sets `path` via `Object.assign`.
    return Object.assign(new TFile(), { path, vault: this });
  };

  read = async (file: TFile): Promise<string> => {
    const content = this.files.get(file.path);
    if (content === undefined) throw new Error(`FakeVault: no file at ${file.path}`);
    return content;
  };

  create = jest.fn(async (path: string, content: string): Promise<TFile> => {
    this.files.set(path, content);
    return Object.assign(new TFile(), { path, vault: this });
  });

  createFolder = async (path: string): Promise<TFolder> => Object.assign(new TFolder(), { path });

  process = jest.fn(async (file: TFile, transform: (content: string) => string): Promise<string> => {
    const next = transform(this.files.get(file.path) ?? '');
    this.files.set(file.path, next);
    return next;
  });

  getMarkdownFiles = (): TFile[] =>
    this.allPaths()
      .filter((path) => path.endsWith('.md'))
      .map((path) => Object.assign(new TFile(), { path, vault: this }));
}

function buildPredecessor(args: {
  id: string;
  title: string;
  chain?: WorkOrderChainConfig;
  chainDepth?: number;
  agent?: string;
  provider?: string;
  model?: string;
  handoff?: string;
}): string {
  const lines: string[] = [
    '---',
    'type: specorator-work-order',
    'schema_version: 1',
    `id: ${args.id}`,
    `title: ${JSON.stringify(args.title)}`,
    'status: done',
    'priority: 2 - normal',
    'created: 2026-07-17T00:00:00.000Z',
    'updated: 2026-07-17T00:00:00.000Z',
  ];
  if (args.agent) lines.push(`agent: ${JSON.stringify(args.agent)}`);
  if (args.provider !== undefined) lines.push(`provider: ${args.provider}`);
  if (args.model !== undefined) lines.push(`model: ${args.model}`);
  lines.push('run_id:', 'conversation_id:', 'sidepanel_tab_id:', 'started:', 'finished:', 'attempts: 1');
  if (args.chain) lines.push(...chainConfigFrontmatterLines(args.chain));
  if (args.chainDepth !== undefined) lines.push(`chain_depth: ${args.chainDepth}`);
  lines.push(
    '---',
    `# ${args.title}`,
    '',
    '## Objective',
    '',
    'Do the thing.',
    '',
    '## Acceptance Criteria',
    '',
    '- [x] done',
    '',
    '## Context',
    '',
    CONTEXT_PLACEHOLDER,
    '',
    '## Constraints',
    '',
    '- none',
    '',
    '## Run Ledger',
    '',
    RUN_LEDGER_START,
    RUN_LEDGER_END,
    '',
    '## Result / Handoff',
    '',
    HANDOFF_START,
    ...(args.handoff ? [args.handoff] : []),
    HANDOFF_END,
    '',
  );
  return lines.join('\n');
}

function buildTemplate(args: { name: string; body: string }): string {
  return ['---', 'type: specorator-work-order-template', 'schema_version: 1', `name: ${JSON.stringify(args.name)}`, '---', args.body, ''].join('\n');
}

const IMPL_TEMPLATE_BODY = `# {{title}}

## Objective

Ship the implementation.

## Acceptance Criteria

- [ ] Implemented

## Context

{{source}}

## Constraints

- Follow the design doc.
`;

function buildPlugin(args: {
  vault: FakeVault;
  events: EventBus<TaskEventMap>;
  maxChainDepth?: number;
  resolveAgentRunTarget?: jest.Mock;
}): SpecoratorPlugin {
  return {
    settings: {
      agentBoardDefaultProvider: 'claude',
      agentBoardDefaultModel: 'sonnet',
      agentBoardWorkOrderFolder: WORK_ORDER_FOLDER,
      agentBoardTemplateFolder: TEMPLATE_FOLDER,
      agentBoardMaxChainDepth: args.maxChainDepth ?? 25,
      providerConfigs: {
        claude: { enabled: true },
        codex: { enabled: false },
        opencode: { enabled: false },
        cursor: { enabled: false },
      },
    },
    events: args.events,
    app: {
      vault: args.vault,
      workspace: {
        getLeaf: jest.fn().mockReturnValue({ openFile: jest.fn().mockResolvedValue(undefined) }),
      },
    },
    logger: { scope: jest.fn(() => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
    resolveAgentRunTarget: args.resolveAgentRunTarget ?? jest.fn().mockResolvedValue(null),
  } as unknown as SpecoratorPlugin;
}

/**
 * Reconstructs the exact `src/main.ts` `WorkOrderChainCoordinator` wiring (same
 * closures, `plugin`/`noteStore` in place of `this`) against a fake plugin, so
 * this test exercises the real wiring shape rather than a simplified stand-in.
 */
function wireCoordinator(plugin: SpecoratorPlugin, noteStore: TaskNoteStore): WorkOrderChainCoordinator {
  const coordinator = new WorkOrderChainCoordinator({
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
      const folder = plugin.settings.agentBoardTemplateFolder || TEMPLATE_FOLDER;
      const { templates } = await new TemplateNoteStore().list(plugin.app.vault, folder);
      return templates;
    },
    createSuccessor: async (plan) => {
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
      // Frontmatter-only audit: stamp chained_to via one atomic vault.process. The
      // coordinator no longer writes the note Run Ledger (a review-triggered
      // writeLedgerSnapshot would erase it), so there is no appendLedger dep.
      await plugin.app.vault.process(file, (content) =>
        noteStore.writeChainLink(content, successorId, new Date().toISOString()),
      );
    },
    readSettings: () => plugin.settings,
    logger: plugin.logger.scope('tasks.chain'),
    showNotice: (message) => { new Notice(message); },
  });
  coordinator.start();
  return coordinator;
}

function setup(args: {
  predecessor: string;
  maxChainDepth?: number;
  resolveAgentRunTarget?: jest.Mock;
  templates?: Array<{ name: string; body: string }>;
}) {
  const vault = new FakeVault();
  vault.seed(PRED_PATH, args.predecessor);
  for (const template of args.templates ?? []) {
    vault.seed(`${TEMPLATE_FOLDER}/${template.name.toLowerCase().replace(/\s+/g, '-')}.md`, buildTemplate(template));
  }
  const events = new EventBus<TaskEventMap>();
  const plugin = buildPlugin({
    vault,
    events,
    maxChainDepth: args.maxChainDepth,
    resolveAgentRunTarget: args.resolveAgentRunTarget,
  });
  const noteStore = new TaskNoteStore();
  wireCoordinator(plugin, noteStore);
  return { vault, events, plugin, noteStore };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function newWorkOrderPaths(vault: FakeVault, before: Set<string>): string[] {
  return vault.allPaths().filter((path) => path.startsWith(`${WORK_ORDER_FOLDER}/`) && !before.has(path));
}

describe('Work-order chaining (integration)', () => {
  // resolveAgentBoardDefaultModel unconditionally calls ProviderRegistry.getChatUIConfig
  // for the resolved provider (only the no-template path short-circuits it), so the
  // template-based scenarios below need a live 'claude' registration. Same
  // save/restore dance as templateTitle.test.ts / defaultProvider.test.ts.
  let priorRegistrations: Record<string, ProviderRegistration> = {};

  beforeAll(() => {
    const registrations = (ProviderRegistry as unknown as { registrations: Record<string, ProviderRegistration> }).registrations;
    priorRegistrations = { ...registrations };
    const makeStub = (id: string, models: { value: string; label: string }[]): ProviderRegistration => ({
      displayName: id,
      blankTabOrder: 0,
      capabilities: { providerId: id } as ProviderRegistration['capabilities'],
      isEnabled: (settings: Record<string, unknown>) =>
        Boolean((settings.providerConfigs as Record<string, { enabled?: boolean }>)?.[id]?.enabled),
      chatUIConfig: {
        getModelOptions: () => models,
        ownsModel: (model: string) => models.some((m) => m.value === model),
      } as unknown as ProviderChatUIConfig,
    } as unknown as ProviderRegistration);
    registrations.claude = makeStub('claude', [{ value: 'sonnet', label: 'Sonnet' }]);
  });

  afterAll(() => {
    const registrations = (ProviderRegistry as unknown as { registrations: Record<string, ProviderRegistration> }).registrations;
    for (const key of Object.keys(registrations)) {
      delete registrations[key];
    }
    Object.assign(registrations, priorRegistrations);
  });

  it('spawns a seeded, ready successor on a matching done trigger, stamps chained_to, and seeds it in the single create write', async () => {
    const predecessor = buildPredecessor({
      id: 'task-1',
      title: 'Design stage',
      provider: 'claude',
      model: 'sonnet',
      chain: { title: 'Impl', trigger: 'done' },
      handoff: HANDOFF_BODY,
    });
    const { vault, events, noteStore } = setup({ predecessor });
    const before = new Set(vault.allPaths());

    events.emit('task:status-changed', { taskId: 'task-1', path: PRED_PATH, status: 'done' });
    await flush();

    const created = newWorkOrderPaths(vault, before);
    expect(created).toHaveLength(1);
    const successorPath = created[0];
    const successor = noteStore.parse(successorPath, vault.getContent(successorPath)!).task;

    expect(successor.frontmatter.status).toBe('ready');
    expect(successor.frontmatter.title).toBe('Impl');
    expect(successor.frontmatter.chained_from).toBe('task-1');
    expect(successor.frontmatter.chain_depth).toBe(1);
    expect(successor.sections.context).toContain(`Chained from [[${WORK_ORDER_FOLDER}/task-1]]`);
    expect(successor.sections.context).toContain('**Next action:**');
    expect(successor.sections.context).toContain('> Ship it');

    const predecessorNow = noteStore.parse(PRED_PATH, vault.getContent(PRED_PATH)!).task;
    expect(predecessorNow.frontmatter.chained_to).toBe(successor.frontmatter.id);

    // Single-write seeding: the content actually handed to vault.create is already
    // `ready` and already carries the seed — there is no create-then-modify window
    // where an auto-run queue could reload a bare, un-seeded `ready` note.
    const createCalls = vault.create.mock.calls.filter(([path]) => path === successorPath);
    expect(createCalls).toHaveLength(1);
    const seededMarkdown = createCalls[0][1] as string;
    expect(seededMarkdown).toContain('status: ready');
    expect(seededMarkdown).toContain(`Chained from [[${WORK_ORDER_FOLDER}/task-1]]`);

    // markChained stamps chained_to via ONE atomic vault.process transform
    // (frontmatter-only audit — there is no ledger line to append).
    expect(vault.process).toHaveBeenCalledTimes(1);
  });

  it('does not spawn a second successor when the same status-changed event fires again', async () => {
    const predecessor = buildPredecessor({
      id: 'task-1',
      title: 'Design stage',
      provider: 'claude',
      model: 'sonnet',
      chain: { title: 'Impl', trigger: 'done' },
      handoff: HANDOFF_BODY,
    });
    const { vault, events } = setup({ predecessor });
    const before = new Set(vault.allPaths());

    events.emit('task:status-changed', { taskId: 'task-1', path: PRED_PATH, status: 'done' });
    await flush();
    expect(newWorkOrderPaths(vault, before)).toHaveLength(1);

    events.emit('task:status-changed', { taskId: 'task-1', path: PRED_PATH, status: 'done' });
    await flush();

    expect(newWorkOrderPaths(vault, before)).toHaveLength(1);
  });

  it('a template-based chain honors the chain_title override over the template name, and still seeds the context', async () => {
    const predecessor = buildPredecessor({
      id: 'task-1',
      title: 'Design stage',
      provider: 'claude',
      model: 'sonnet',
      chain: { template: 'Impl stage', title: 'Wire the API', trigger: 'done' },
      handoff: HANDOFF_BODY,
    });
    const { vault, events, noteStore } = setup({
      predecessor,
      templates: [{ name: 'Impl stage', body: IMPL_TEMPLATE_BODY }],
    });
    const before = new Set(vault.allPaths());

    events.emit('task:status-changed', { taskId: 'task-1', path: PRED_PATH, status: 'done' });
    await flush();

    const created = newWorkOrderPaths(vault, before);
    expect(created).toHaveLength(1);
    const successor = noteStore.parse(created[0], vault.getContent(created[0])!).task;

    expect(successor.frontmatter.title).toBe('Wire the API');
    expect(successor.frontmatter.title).not.toBe('Impl stage');
    expect(successor.body).toContain('Ship the implementation.');
    expect(successor.sections.context).toContain(`Chained from [[${WORK_ORDER_FOLDER}/task-1]]`);
    expect(successor.sections.context).toContain('> Ship it');
    expect(successor.frontmatter.chained_from).toBe('task-1');
    expect(successor.frontmatter.chain_depth).toBe(1);
  });

  it('inherits the resolved agent run target for an agent-only predecessor, not the board defaults', async () => {
    const predecessor = buildPredecessor({
      id: 'task-1',
      title: 'Design stage',
      agent: 'roster:writer',
      chain: { title: 'Next hop', trigger: 'done' },
      handoff: HANDOFF_BODY,
    });
    const resolveAgentRunTarget = jest.fn().mockResolvedValue({ providerId: 'codex', model: 'gpt-5-codex' });
    const { vault, events, noteStore } = setup({ predecessor, resolveAgentRunTarget });
    const before = new Set(vault.allPaths());

    events.emit('task:status-changed', { taskId: 'task-1', path: PRED_PATH, status: 'done' });
    await flush();

    expect(resolveAgentRunTarget).toHaveBeenCalledWith('roster:writer');
    const created = newWorkOrderPaths(vault, before);
    expect(created).toHaveLength(1);
    const successor = noteStore.parse(created[0], vault.getContent(created[0])!).task;

    expect(successor.frontmatter.provider).toBe('codex');
    expect(successor.frontmatter.model).toBe('gpt-5-codex');
    expect(successor.frontmatter.agent).toBe('roster:writer');
    expect(successor.frontmatter.provider).not.toBe('claude');
    expect(successor.frontmatter.model).not.toBe('sonnet');
  });

  it('createWorkOrderFromSeed: an explicit seed.chain wins over the picked template\'s own chain', async () => {
    const vault = new FakeVault();
    const events = new EventBus<TaskEventMap>();
    const plugin = buildPlugin({ vault, events });
    const noteStore = new TaskNoteStore();

    const template: WorkOrderTemplate = {
      path: `${TEMPLATE_FOLDER}/other.md`,
      name: 'Other template',
      body: '# {{title}}\n\nTemplate body.\n',
      chain: { template: 'Template chain target', trigger: 'review' },
    };

    const file = await createWorkOrderFromSeed(
      plugin,
      { title: 'Direct seed', chain: { title: 'Seed chain target', trigger: 'done' } },
      { template, reveal: 'none' },
    );

    expect(file).not.toBeNull();
    const content = vault.getContent(file!.path)!;
    const fm = noteStore.parse(file!.path, content).task.frontmatter;
    expect(fm.chain_title).toBe('Seed chain target');
    expect(fm.chain_trigger).toBe('done');
    expect(fm.chain_template).toBeUndefined();
  });

  it('does not spawn past the configured max chain depth', async () => {
    const predecessor = buildPredecessor({
      id: 'task-1',
      title: 'Design stage',
      provider: 'claude',
      model: 'sonnet',
      chain: { title: 'Whatever', trigger: 'done' },
      chainDepth: 2,
      handoff: HANDOFF_BODY,
    });
    const { vault, events, noteStore } = setup({ predecessor, maxChainDepth: 2 });
    const before = new Set(vault.allPaths());

    events.emit('task:status-changed', { taskId: 'task-1', path: PRED_PATH, status: 'done' });
    await flush();

    expect(newWorkOrderPaths(vault, before)).toHaveLength(0);
    const predecessorNow = noteStore.parse(PRED_PATH, vault.getContent(PRED_PATH)!).task;
    expect(predecessorNow.frontmatter.chained_to).toBeUndefined();
    // The setup isolates the depth cap as the only possible skip reason (matching trigger +
    // valid chain + depth already at the cap), so "no new note + no chained_to" proves the
    // cap fired. Depth-cap surfaces via a Notice only; the frontmatter-only audit writes no
    // ledger line to assert here.
  });

  it('falls back to a blank successor when the configured chain template is missing', async () => {
    const predecessor = buildPredecessor({
      id: 'task-1',
      title: 'Research task',
      provider: 'claude',
      model: 'sonnet',
      chain: { template: 'Nonexistent template', trigger: 'done' },
      handoff: HANDOFF_BODY,
    });
    const { vault, events, noteStore } = setup({ predecessor });
    const before = new Set(vault.allPaths());

    events.emit('task:status-changed', { taskId: 'task-1', path: PRED_PATH, status: 'done' });
    await flush();

    const created = newWorkOrderPaths(vault, before);
    expect(created).toHaveLength(1);
    const successor = noteStore.parse(created[0], vault.getContent(created[0])!).task;
    expect(successor.frontmatter.title).toBe('Research task — next');
    expect(successor.frontmatter.status).toBe('ready');
  });
});
