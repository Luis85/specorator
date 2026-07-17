import { buildSuccessorPlan, WorkOrderChainCoordinator } from '../../../../../src/features/tasks/execution/WorkOrderChainCoordinator';
import type { TaskSpec } from '../../../../../src/features/tasks/model/taskTypes';

function task(overrides: Partial<TaskSpec['frontmatter']> = {}, handoff = ''): TaskSpec {
  return {
    path: 'Agent Board/tasks/task-1.md',
    frontmatter: {
      type: 'specorator-work-order', schema_version: 1, id: 'task-1', title: 'A',
      status: 'done', priority: '2 - normal', created: 't', updated: 't', attempts: 1,
      provider: 'claude', model: 'm', ...overrides,
    },
    sections: { objective: '', acceptanceCriteria: '', context: '', constraints: '', ledger: '', handoff },
    body: '', raw: '',
  };
}

const HANDOFF = `## Summary\ndid x\n## Verification\nran\n## Risks\nNone\n## Next Action\nShip it`;

describe('buildSuccessorPlan', () => {
  it('skips when no chain configured', () => {
    expect(buildSuccessorPlan({ predecessor: task(), enteredStatus: 'done', template: undefined, maxDepth: 25 }).kind).toBe('skip');
  });

  it('skips when the trigger does not match the entered status', () => {
    const t = task({ chain_title: 'Next', chain_trigger: 'review' } as never);
    expect(buildSuccessorPlan({ predecessor: t, enteredStatus: 'done', template: undefined, maxDepth: 25 }).kind).toBe('skip');
  });

  it('skips when already chained', () => {
    const t = task({ chain_title: 'Next', chained_to: 'task-2' } as never);
    expect(buildSuccessorPlan({ predecessor: t, enteredStatus: 'done', template: undefined, maxDepth: 25 }).kind).toBe('skip');
  });

  it('skips at/over max depth', () => {
    const t = task({ chain_title: 'Next', chain_depth: 25 } as never);
    const plan = buildSuccessorPlan({ predecessor: t, enteredStatus: 'done', template: undefined, maxDepth: 25 });
    expect(plan.kind).toBe('skip');
    if (plan.kind !== 'skip') return;
    expect(plan.reason).toMatch(/depth/i);
  });

  it('builds a blank plan: title fallback, next-action context, provider inherited, depth+1', () => {
    const t = task({ chain_objective: 'Do next' } as never, HANDOFF);
    const plan = buildSuccessorPlan({ predecessor: t, enteredStatus: 'done', template: undefined, maxDepth: 25 });
    expect(plan.kind).toBe('create');
    if (plan.kind !== 'create') return;
    expect(plan.seed.titleOverride).toBeUndefined();
    expect(plan.seed.title).toBe('A — next');
    expect(plan.seed.objective).toBe('Do next');
    expect(plan.seed.provider).toBe('claude');
    expect(plan.seed.chainedFrom).toBe('task-1');
    expect(plan.seed.chainDepth).toBe(1);
    expect(plan.nextAction).toBe('Ship it');
  });

  it('honors title override with a template and inherits the template chain', () => {
    const t = task({ chain_template: 'Impl', chain_title: 'Custom' } as never, HANDOFF);
    const template = { path: 'p', name: 'Impl', body: '# Impl', chain: { template: 'Verify', trigger: 'done' as const } };
    const plan = buildSuccessorPlan({ predecessor: t, enteredStatus: 'done', template, maxDepth: 25 });
    if (plan.kind !== 'create') throw new Error('expected create');
    expect(plan.seed.titleOverride).toBe('Custom');
    expect(plan.seed.chain).toEqual({ template: 'Verify', trigger: 'done' });
  });
});

describe('WorkOrderChainCoordinator', () => {
  function harness() {
    const created: unknown[] = [];
    const linked: Array<[string, string]> = [];
    const deps = {
      events: { on: () => () => {} },
      loadTaskSpec: jest.fn(async () => task({ chain_title: 'Next' } as never, HANDOFF)),
      listTemplates: jest.fn(async () => []),
      createSuccessor: jest.fn(async (plan: { seed: { title: string } }) => { created.push(plan); return task({ id: 'task-2' }); }),
      linkSuccessor: jest.fn(async (p: string, id: string) => { linked.push([p, id]); }),
      appendLedger: jest.fn(async () => {}),
      readSettings: () => ({ agentBoardMaxChainDepth: 25 }),
      now: () => 't',
      logger: { debug() {}, warn() {}, error() {} },
      showNotice: jest.fn(),
    };
    const coord = new WorkOrderChainCoordinator(deps as never);
    coord.start();
    // fire() calls the public handler DIRECTLY and returns its promise, so `await fire(...)`
    // waits for the whole async chain (loadTaskSpec → createSuccessor → linkSuccessor)
    // rather than racing it — the production subscription is fire-and-forget (`void`), whose
    // returned void would let an `await` assert before the coordinator finished its work.
    return {
      fire: (status: string) =>
        coord.handleStatusChanged({ taskId: 'task-1', path: 'Agent Board/tasks/task-1.md', status } as never),
      deps, created, linked,
    };
  }

  it('spawns once on a matching trigger and stamps the back-link', async () => {
    const h = harness();
    await h.fire('done');
    expect(h.created).toHaveLength(1);
    expect(h.linked).toEqual([['Agent Board/tasks/task-1.md', 'task-2']]);
  });

  it('ignores non-review/done statuses', async () => {
    const h = harness();
    await h.fire('running');
    expect(h.deps.loadTaskSpec).not.toHaveBeenCalled();
  });

  it('a non-matching event does not suppress the matching one (review then done, done-trigger)', async () => {
    // harness().loadTaskSpec returns a chain_title:'Next' task → default trigger 'done'.
    // Fire both near-concurrently (no await between): the review event must NOT reserve
    // the path and block the done event, which is the one that should spawn.
    const h = harness();
    const a = h.fire('review');
    const b = h.fire('done');
    await Promise.all([a, b]);
    expect(h.created).toHaveLength(1);
    expect(h.linked).toEqual([['Agent Board/tasks/task-1.md', 'task-2']]);
  });
});
