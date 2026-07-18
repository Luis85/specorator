jest.mock('@/features/tasks/ui/ChainConfigModal', () => ({
  chooseChainConfig: jest.fn(),
}));

import type { TaskSpec } from '@/features/tasks/model/taskTypes';
import type { WorkOrderChainConfig } from '@/features/tasks/model/workOrderChain';
import { chooseChainConfig } from '@/features/tasks/ui/ChainConfigModal';
import { buildChainDetailCallbacks, chainSummaryForTask, chainSummaryFromConfig } from '@/features/tasks/ui/workOrderChainSummary';
import type SpecoratorPlugin from '@/main';

const mockChooseChainConfig = chooseChainConfig as jest.Mock;

function asPlugin(stub: Record<string, unknown> = {}): SpecoratorPlugin {
  return stub as unknown as SpecoratorPlugin;
}

function makeTask(extraFrontmatter: Record<string, unknown> = {}): TaskSpec {
  return {
    path: 'Agent Board/tasks/wo-1.md',
    frontmatter: {
      type: 'specorator-work-order',
      schema_version: 1,
      id: 'wo-1',
      title: 'WO 1',
      status: 'ready',
      priority: '2 - normal',
      created: '2026-06-05T00:00:00Z',
      updated: '2026-06-05T00:00:00Z',
      attempts: 0,
      ...extraFrontmatter,
    } as TaskSpec['frontmatter'],
    sections: { objective: '', acceptanceCriteria: '', context: '', constraints: '', ledger: '', handoff: '' },
    body: '',
    raw: '',
  };
}

// chain_* is a loosely-typed extension bag on TaskFrontmatter (see
// workOrderChainSummary.ts's chainFrontmatter comment) — cast to read it back.
function frontmatterBag(task: TaskSpec): Record<string, unknown> {
  return task.frontmatter as unknown as Record<string, unknown>;
}

beforeEach(() => {
  mockChooseChainConfig.mockReset();
});

describe('chainSummaryFromConfig', () => {
  const doneConfig = (partial: Partial<WorkOrderChainConfig> = {}): WorkOrderChainConfig => ({
    trigger: 'done',
    ...partial,
  });

  it('prefers the title over template and objective', () => {
    expect(chainSummaryFromConfig(doneConfig({ title: 'My title', template: 'Tpl', objective: 'Obj' }))).toBe('My title');
  });

  it('falls back to the template when there is no title', () => {
    expect(chainSummaryFromConfig(doneConfig({ template: 'Impl', objective: 'Obj' }))).toBe('Impl');
  });

  it('falls back to the objective when there is no title or template', () => {
    expect(chainSummaryFromConfig(doneConfig({ objective: 'Do the thing' }))).toBe('Do the thing');
  });

  it('truncates a long objective-only label with an ellipsis', () => {
    const longObjective = 'x'.repeat(60);
    const summary = chainSummaryFromConfig(doneConfig({ objective: longObjective }));
    expect(summary).toBe(`${'x'.repeat(39)}…`);
    expect(summary.length).toBe(40);
  });

  it('falls back to "None" when nothing is configured', () => {
    expect(chainSummaryFromConfig(doneConfig())).toBe('None');
  });

  it('does not append the on-handoff suffix for the done trigger', () => {
    expect(chainSummaryFromConfig(doneConfig({ title: 'My title' }))).toBe('My title');
  });

  it('appends the on-handoff suffix for the review trigger', () => {
    expect(chainSummaryFromConfig({ title: 'My title', trigger: 'review' })).toBe('My title · on handoff');
  });

  it('appends the on-handoff suffix regardless of which field produced the label', () => {
    expect(chainSummaryFromConfig({ template: 'Impl', trigger: 'review' })).toBe('Impl · on handoff');
  });
});

describe('chainSummaryForTask', () => {
  it('reads "None" from a task with no chain_* frontmatter', () => {
    expect(chainSummaryForTask(makeTask())).toBe('None');
  });

  it('reads the configured summary (including the suffix) from chain_* frontmatter', () => {
    const task = makeTask({ chain_title: 'Wire it', chain_trigger: 'review' });
    expect(chainSummaryForTask(task)).toBe('Wire it · on handoff');
  });
});

describe('buildChainDetailCallbacks', () => {
  it('omits getLoopName/onPickLoop when no loopDeps are supplied (WorkOrderActivityProvider call site)', () => {
    const callbacks = buildChainDetailCallbacks(asPlugin(), jest.fn());

    expect(callbacks.getLoopName).toBeUndefined();
    expect(callbacks.onPickLoop).toBeUndefined();
    expect(callbacks.onConfigureChain).toEqual(expect.any(Function));
    expect(callbacks.getChainSummary).toEqual(expect.any(Function));
  });

  it('wires getLoopName/onPickLoop from the supplied loopDeps (AgentBoardView call site)', async () => {
    const loopNameCache = new Map([['repro', 'Repro loop']]);
    const pickLoopForTask = jest.fn().mockResolvedValue('repro');
    const callbacks = buildChainDetailCallbacks(asPlugin(), jest.fn(), { loopNameCache, pickLoopForTask });

    expect(callbacks.getLoopName?.('repro')).toBe('Repro loop');
    expect(callbacks.getLoopName?.('missing')).toBeUndefined();
    expect(callbacks.getLoopName?.(undefined)).toBeUndefined();

    const task = makeTask();
    await expect(callbacks.onPickLoop?.(task)).resolves.toBe('repro');
    expect(pickLoopForTask).toHaveBeenCalledWith(task);
  });

  it('getChainSummary reads the current chain_* frontmatter off the task', () => {
    const callbacks = buildChainDetailCallbacks(asPlugin(), jest.fn());
    const task = makeTask({ chain_title: 'Wire it', chain_trigger: 'done' });

    expect(callbacks.getChainSummary?.(task)).toBe('Wire it');
  });

  describe('onConfigureChain', () => {
    it('resolves undefined without calling saveFields when the modal is cancelled', async () => {
      mockChooseChainConfig.mockResolvedValueOnce(undefined);
      const saveFields = jest.fn();
      const task = makeTask({ chain_title: 'Existing' });
      const callbacks = buildChainDetailCallbacks(asPlugin(), saveFields);

      const summary = await callbacks.onConfigureChain?.(task);

      expect(summary).toBeUndefined();
      expect(saveFields).not.toHaveBeenCalled();
      expect(frontmatterBag(task).chain_title).toBe('Existing');
    });

    it('routes a configured result through saveFields and resolves its summary', async () => {
      const config: WorkOrderChainConfig = { title: 'Wire it', trigger: 'review' };
      mockChooseChainConfig.mockResolvedValueOnce(config);
      const saveFields = jest.fn().mockResolvedValue(undefined);
      const task = makeTask();
      const callbacks = buildChainDetailCallbacks(asPlugin(), saveFields);

      const summary = await callbacks.onConfigureChain?.(task);

      expect(saveFields).toHaveBeenCalledWith(task, { chain: config });
      expect(summary).toBe('Wire it · on handoff');
    });

    it('passes the task’s current chain_* frontmatter as the modal prefill', async () => {
      mockChooseChainConfig.mockResolvedValueOnce(undefined);
      const task = makeTask({ chain_title: 'Existing', chain_trigger: 'review' });
      const callbacks = buildChainDetailCallbacks(asPlugin(), jest.fn());

      await callbacks.onConfigureChain?.(task);

      expect(mockChooseChainConfig).toHaveBeenCalledWith(expect.anything(), { title: 'Existing', trigger: 'review' });
    });

    // Item 1 fix: without this, task.frontmatter stays stale until the board's
    // next vault-modify re-index, so a same-session reopen would prefill the
    // config modal from the pre-save chain and a second Save could clobber the
    // config just written.
    it('syncs task.frontmatter chain_* keys in place after a successful save', async () => {
      const config: WorkOrderChainConfig = { title: 'Wire it', trigger: 'review' };
      mockChooseChainConfig.mockResolvedValueOnce(config);
      const saveFields = jest.fn().mockResolvedValue(undefined);
      const task = makeTask();
      const callbacks = buildChainDetailCallbacks(asPlugin(), saveFields);

      await callbacks.onConfigureChain?.(task);

      const fm = frontmatterBag(task);
      expect(fm.chain_title).toBe('Wire it');
      expect(fm.chain_trigger).toBe('review');
      expect(fm.chain_template).toBeUndefined();
      expect(fm.chain_objective).toBeUndefined();
    });

    it('a same-session reopen after a successful save prefills from the just-saved config, not the stale one', async () => {
      const firstSave: WorkOrderChainConfig = { title: 'First', trigger: 'done' };
      mockChooseChainConfig.mockResolvedValueOnce(firstSave);
      const saveFields = jest.fn().mockResolvedValue(undefined);
      const task = makeTask();
      const callbacks = buildChainDetailCallbacks(asPlugin(), saveFields);

      await callbacks.onConfigureChain?.(task);

      mockChooseChainConfig.mockResolvedValueOnce(undefined);
      await callbacks.onConfigureChain?.(task);

      expect(mockChooseChainConfig).toHaveBeenLastCalledWith(expect.anything(), firstSave);
    });

    it('clears task.frontmatter chain_* keys when the modal resolves null (Clear)', async () => {
      mockChooseChainConfig.mockResolvedValueOnce(null);
      const saveFields = jest.fn().mockResolvedValue(undefined);
      const task = makeTask({ chain_title: 'Old', chain_trigger: 'review', chain_template: 'Old tpl' });
      const callbacks = buildChainDetailCallbacks(asPlugin(), saveFields);

      const summary = await callbacks.onConfigureChain?.(task);

      expect(saveFields).toHaveBeenCalledWith(task, { chain: null });
      expect(summary).toBe('None');
      const fm = frontmatterBag(task);
      expect(fm.chain_title).toBeUndefined();
      expect(fm.chain_trigger).toBeUndefined();
      expect(fm.chain_template).toBeUndefined();
    });
  });
});
