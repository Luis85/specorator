---
title: Work-order chaining implementation plan — spawn a configured successor on completion
date: 2026-07-17
status: approved
scope: features/tasks (model/workOrderChain, execution/WorkOrderChainCoordinator, storage/TaskNoteStore, commands/taskCommands, templates, ui/ChainConfigModal + ui/vue chip + card, ui/workOrderTemplateEditorForm), app/core settings, main.ts wiring, i18n (types/tasks + locales), src/features/tasks/CLAUDE.md
---

# Work-Order Chaining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a work order spawn a configured successor work order when it finishes — seeded with the predecessor's wikilink + handoff next-action, landing in `ready` — so the Agent Board runs lightweight pipelines.

**Architecture:** A plugin-level `WorkOrderChainCoordinator` (mirroring `CommitOnAcceptCoordinator`) subscribes once to `task:status-changed`. When a work order enters `review` or `done` and its configured trigger matches, a pure `buildSuccessorPlan` decides what to create; the coordinator creates the successor by reusing `createWorkOrderFromSeed` plus a deterministic context/objective inject write, stamps a `chained_to` back-link, and appends a ledger line. Idempotency (`chained_to`), an in-flight guard, and a `agentBoardMaxChainDepth` cap bound runaway chains.

**Tech Stack:** TypeScript, Obsidian plugin API, Vue 3 + Pinia (board/detail islands), Jest (unit/integration), i18n JSON locales with a typed key union.

**Spec:** `docs/superpowers/specs/2026-07-17-work-order-chaining-design.md`

---

## Conventions for every task

- Run a single test file: `npm run test -- --selectProjects unit -t "<describe/it substring>"` or by path `npm run test -- <testfile>`.
- Commit after each task with the message shown. Committer identity is already `Claude <noreply@anthropic.com>`.
- After any task that adds or edits functions under `src/`, also run `npm run check:quality` — the fallow complexity / duplication / dead-code ratchet is a **blocking CI gate** (`quality` job). A newly-complex function must be simplified (extract helpers), not ratcheted, unless the trade-off is deliberate and justified in the PR. Prefer extracting a small private helper over inlining branch-heavy logic into an already-large method.
- After the final task run the full gate: `npm run typecheck && npm run lint && npm run test && npm run build && npm run check:quality`.
- Do NOT put `console.*` in `src/`. Do NOT use `innerHTML`/`v-html`; build DOM via Obsidian `createEl`/`setIcon` and render markdown via `MarkdownRenderer`.

---

## Task 1: Chain config model

**Files:**
- Create: `src/features/tasks/model/workOrderChain.ts`
- Test: `tests/unit/features/tasks/model/workOrderChain.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/tasks/model/workOrderChain.test.ts
import {
  chainConfigFrontmatterLines,
  DEFAULT_CHAIN_TRIGGER,
  parseChainConfig,
} from '../../../../../src/features/tasks/model/workOrderChain';

describe('parseChainConfig', () => {
  it('returns null when template, title, and objective are all absent', () => {
    expect(parseChainConfig({})).toBeNull();
    expect(parseChainConfig({ chain_trigger: 'review' })).toBeNull();
  });

  it('treats an objective-only config as configured', () => {
    expect(parseChainConfig({ chain_objective: 'Do the next thing' })).toEqual({
      trigger: 'done',
      objective: 'Do the next thing',
    });
  });

  it('reads template + title + objective + trigger', () => {
    expect(
      parseChainConfig({
        chain_template: 'Implement stage',
        chain_title: 'Wire API',
        chain_objective: 'obj',
        chain_trigger: 'review',
      }),
    ).toEqual({ template: 'Implement stage', title: 'Wire API', objective: 'obj', trigger: 'review' });
  });

  it('defaults an absent or invalid trigger to done', () => {
    expect(parseChainConfig({ chain_title: 'x' })?.trigger).toBe('done');
    expect(parseChainConfig({ chain_title: 'x', chain_trigger: 'bogus' })?.trigger).toBe('done');
    expect(DEFAULT_CHAIN_TRIGGER).toBe('done');
  });

  it('ignores blank/whitespace values', () => {
    expect(parseChainConfig({ chain_template: '   ', chain_title: '' })).toBeNull();
  });
});

describe('chainConfigFrontmatterLines', () => {
  it('emits only the set keys, JSON-quoting string values', () => {
    expect(chainConfigFrontmatterLines({ template: 'Impl', trigger: 'done' })).toEqual([
      'chain_template: "Impl"',
      'chain_trigger: done',
    ]);
  });

  it('emits title/objective when present', () => {
    expect(chainConfigFrontmatterLines({ title: 'T', objective: 'O', trigger: 'review' })).toEqual([
      'chain_title: "T"',
      'chain_objective: "O"',
      'chain_trigger: review',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/unit/features/tasks/model/workOrderChain.test.ts`
Expected: FAIL — "Cannot find module '.../workOrderChain'".

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/unit/features/tasks/model/workOrderChain.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/model/workOrderChain.ts tests/unit/features/tasks/model/workOrderChain.test.ts
git commit -m "feat(tasks): work-order chain config model (parse/serialize)"
```

---

## Task 2: Setting — `agentBoardMaxChainDepth`

**Files:**
- Modify: `src/core/types/settings.ts` (near `agentBoardQueueHaltAfter`, ~line 219)
- Modify: `src/app/settings/defaultSettings.ts` (near `agentBoardQueueHaltAfter`, ~line 79)
- Test: `tests/unit/app/settings/defaultSettings.test.ts` (add a case if the file exists; otherwise skip the test step — this is a one-line default covered by typecheck)

- [ ] **Step 1: Add the setting type**

In `src/core/types/settings.ts`, after the `agentBoardQueueHaltAfter: number;` line:

```ts
  /** Max hop depth for work-order chains; a successor at/over this is not spawned. */
  agentBoardMaxChainDepth: number;
```

- [ ] **Step 2: Add the default**

In `src/app/settings/defaultSettings.ts`, after `agentBoardQueueHaltAfter: 3,`:

```ts
  agentBoardMaxChainDepth: 25,
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (no missing-property error on the settings object).

- [ ] **Step 4: Commit**

```bash
git add src/core/types/settings.ts src/app/settings/defaultSettings.ts
git commit -m "feat(tasks): add agentBoardMaxChainDepth setting (default 25)"
```

---

## Task 3: `TaskNoteStore` — chain field, back-link, context inject

**Files:**
- Modify: `src/features/tasks/storage/TaskNoteStore.ts`
- Test: `tests/unit/features/tasks/storage/TaskNoteStore.test.ts` (add to the existing suite if present; else create)

Adds `chain` to `WriteFieldsOptions`, and two methods: `writeChainLink` (stamps `chained_to`) and `writeChainContext` (prepends the chain seed into `## Context`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/tasks/storage/TaskNoteStore.test.ts  (add these describes)
import { TaskNoteStore } from '../../../../../src/features/tasks/storage/TaskNoteStore';

const NOTE = `---
type: specorator-work-order
schema_version: 1
id: task-1
title: "T"
status: ready
priority: 2 - normal
created: 2026-07-17T00:00:00.000Z
updated: 2026-07-17T00:00:00.000Z
provider: claude
model: m
run_id:
conversation_id:
sidepanel_tab_id:
started:
finished:
attempts: 0
---
# T

## Objective

Do it.

## Acceptance Criteria

- [ ] x

## Context

_Add the links, files, and scope the agent needs._

## Constraints

- none

## Run Ledger

<!-- specorator:run-ledger-start -->
<!-- specorator:run-ledger-end -->

## Result / Handoff

<!-- specorator:handoff-start -->
<!-- specorator:handoff-end -->
`;

describe('TaskNoteStore chain writes', () => {
  const store = new TaskNoteStore();

  it('writeFields sets chain_* keys and clears them on null', () => {
    const withChain = store.writeFields(NOTE, {
      chain: { template: 'Impl', trigger: 'review', title: 'Next', objective: 'obj' },
    });
    const parsed = store.parse('p', withChain).task.frontmatter;
    expect(parsed.chain_template).toBe('Impl');
    expect(parsed.chain_trigger).toBe('review');
    expect(parsed.chain_title).toBe('Next');
    expect(parsed.chain_objective).toBe('obj');

    const cleared = store.writeFields(withChain, { chain: null });
    const clearedFm = store.parse('p', cleared).task.frontmatter;
    expect(clearedFm.chain_template).toBeUndefined();
    expect(clearedFm.chain_trigger).toBeUndefined();
    expect(clearedFm.chain_title).toBeUndefined();
    expect(clearedFm.chain_objective).toBeUndefined();
  });

  it('writeChainLink stamps chained_to', () => {
    const out = store.writeChainLink(NOTE, 'task-2', '2026-07-17T01:00:00.000Z');
    expect(store.parse('p', out).task.frontmatter.chained_to).toBe('task-2');
  });

  it('writeChainContext prepends the seed and drops the placeholder', () => {
    const out = store.writeChainContext(NOTE, {
      predecessorPath: 'Agent Board/tasks/task-1.md',
      nextAction: 'Ship it',
    });
    const context = store.parse('p', out).task.sections.context;
    expect(context).toContain('Chained from [[Agent Board/tasks/task-1]]');
    expect(context).toContain('**Next action:**');
    expect(context).toContain('> Ship it');
    expect(context).not.toContain('_Add the links');
  });

  it('writeChainContext blockquotes next_action so an embedded heading cannot split Context', () => {
    const out = store.writeChainContext(NOTE, {
      predecessorPath: 'Agent Board/tasks/task-1.md',
      nextAction: 'Do X\n## Looks like a heading\nDo Y',
    });
    const parsed = store.parse('p', out).task;
    // The whole seed stays inside Context — the embedded '## ' did not start a new section.
    expect(parsed.sections.context).toContain('Do X');
    expect(parsed.sections.context).toContain('## Looks like a heading');
    expect(parsed.sections.context).toContain('Do Y');
    // Generated regions remain intact.
    expect(out).toContain('<!-- specorator:run-ledger-start -->');
    expect(out).toContain('<!-- specorator:handoff-start -->');
  });

  it('writeChainContext omits the next-action line when empty and preserves existing context', () => {
    const seeded = NOTE.replace('_Add the links, files, and scope the agent needs._', '- [[ref]]');
    const out = store.writeChainContext(seeded, {
      predecessorPath: 'Agent Board/tasks/task-1.md',
      nextAction: '',
    });
    const context = store.parse('p', out).task.sections.context;
    expect(context).toContain('Chained from [[Agent Board/tasks/task-1]]');
    expect(context).not.toContain('**Next action:**');
    expect(context).toContain('- [[ref]]');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/unit/features/tasks/storage/TaskNoteStore.test.ts -t "chain writes"`
Expected: FAIL — `writeChainLink`/`writeChainContext` undefined; `chain` not accepted by `writeFields`.

- [ ] **Step 3: Implement**

In `src/features/tasks/storage/TaskNoteStore.ts`:

Add the import at the top (only the type is needed — `writeFields` sets the `chain_*`
keys directly on the frontmatter object, which is serialized via `stringifyYaml`; the
raw-YAML `chainConfigFrontmatterLines` builder is used only by `taskCommands`):

```ts
import type { WorkOrderChainConfig } from '../model/workOrderChain';
```

Extend `WriteFieldsOptions` (after the `loop?` field):

```ts
  /** Successor chain config to write; an explicit `null` clears all `chain_*` keys. */
  chain?: WorkOrderChainConfig | null;
```

In `writeFields`, after the existing `if (fields.loop !== undefined) { ... }` block and before `frontmatter.updated = timestamp;`, delegate to a helper (keeping `writeFields` under the fallow complexity ratchet — inlining the block here trips `check:quality`'s `complexFunctions` gate):

```ts
    if (fields.chain !== undefined) {
      this.applyChainFields(frontmatter, fields.chain);
    }
```

Add the helper as a private method on the class:

```ts
  /**
   * Write or clear the `chain_*` frontmatter keys. Extracted from `writeFields` so that
   * method stays under the fallow complexity ratchet. An explicit `null` clears the chain
   * (all four keys); a config re-adds only the set keys plus the always-explicit trigger.
   */
  private applyChainFields(frontmatter: Record<string, unknown>, chain: WorkOrderChainConfig | null): void {
    delete frontmatter.chain_template;
    delete frontmatter.chain_title;
    delete frontmatter.chain_objective;
    delete frontmatter.chain_trigger;
    if (!chain) return;
    if (chain.template) frontmatter.chain_template = chain.template;
    if (chain.title) frontmatter.chain_title = chain.title;
    if (chain.objective) frontmatter.chain_objective = chain.objective;
    frontmatter.chain_trigger = chain.trigger;
  }
```

Add these two public methods (e.g. after `writeFields`):

```ts
  /**
   * Stamp `chained_to` on a predecessor note after its successor is spawned. This
   * is the idempotency guard (the coordinator skips a note that already has it) and
   * a forward link. Bumps `updated`.
   */
  writeChainLink(content: string, successorId: string, timestamp: string = new Date().toISOString()): string {
    const parsed = this.parse('', content);
    const frontmatter: Record<string, unknown> = { ...parsed.task.frontmatter };
    frontmatter.chained_to = successorId;
    frontmatter.updated = timestamp;
    return this.withFrontmatter(frontmatter, parsed.task.body);
  }

  /**
   * Insert the chain seed at the top of the `## Context` section: a wikilink back
   * to the predecessor plus (when present) its handoff next-action. Drops the
   * default Context placeholder; preserves any existing context below. Kept within
   * the section (no `##` sub-heading, which `writeSections`/`replaceSection` would
   * read as the next section boundary).
   */
  writeChainContext(
    content: string,
    args: { predecessorPath: string; nextAction: string },
    timestamp: string = new Date().toISOString(),
  ): string {
    const parsed = this.parse('', content);
    const wikilink = args.predecessorPath.replace(/\.md$/i, '');
    const lines = [`Chained from [[${wikilink}]] — see its Result / Handoff.`];
    // Blockquote each line of nextAction so a heading the handoff parser preserved inside
    // it (`## ...`) can't become a real `## ` section boundary inside Context — which, on
    // the next parse, extractSection would treat as the next section, truncating the seed.
    const nextAction = args.nextAction.trim();
    if (nextAction.length > 0) {
      const quoted = nextAction.split('\n').map((line) => `> ${line}`).join('\n');
      lines.push('', '**Next action:**', quoted);
    }
    const existing = parsed.task.sections.context.trim();
    const keep = existing && existing !== CONTEXT_PLACEHOLDER ? `\n\n${existing}` : '';
    const nextContext = `${lines.join('\n')}${keep}`;

    const body = this.replaceSection(parsed.task.body, SECTION_HEADINGS.context, nextContext);
    const frontmatter: Record<string, unknown> = { ...parsed.task.frontmatter };
    frontmatter.updated = timestamp;
    return this.withFrontmatter(frontmatter, body);
  }
```

> Note: `replaceSection` and `SECTION_HEADINGS` are already private members of this class; `CONTEXT_PLACEHOLDER` is already imported/defined in this file. `writeChainContext` reuses `replaceSection` (which stops at the next `##`, so the generated regions are never touched).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/unit/features/tasks/storage/TaskNoteStore.test.ts -t "chain writes"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/storage/TaskNoteStore.ts tests/unit/features/tasks/storage/TaskNoteStore.test.ts
git commit -m "feat(tasks): TaskNoteStore chain field + writeChainLink + writeChainContext"
```

---

## Task 4: Creation path — seed fields, provenance frontmatter, title precedence

**Files:**
- Modify: `src/features/tasks/commands/taskCommands.ts`
- Test: `tests/unit/features/tasks/commands/taskCommands.test.ts` (extend existing suite)

Threads chain config + provenance + `titleOverride` through the work-order builder so a created note carries `chain_*`, `chained_from`, `chain_depth`, and so an explicit title wins over a template name.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/tasks/commands/taskCommands.test.ts (add)
import { __taskCommandTestUtils } from '../../../../../src/features/tasks/commands/taskCommands';
import { TaskNoteStore } from '../../../../../src/features/tasks/storage/TaskNoteStore';

const { buildWorkOrderFromTemplate, buildWorkOrderMarkdown } = __taskCommandTestUtils;
const store = new TaskNoteStore();

describe('work-order builder — chain metadata', () => {
  it('buildWorkOrderMarkdown emits chain config + provenance frontmatter', () => {
    const md = buildWorkOrderMarkdown({
      id: 'task-2',
      title: 'Successor',
      provider: 'claude',
      model: 'm',
      timestamp: '2026-07-17T00:00:00.000Z',
      status: 'ready',
      chain: { template: 'Verify', trigger: 'done' },
      chainedFrom: 'task-1',
      chainDepth: 2,
    });
    const fm = store.parse('p', md).task.frontmatter;
    expect(fm.chain_template).toBe('Verify');
    expect(fm.chain_trigger).toBe('done');
    expect(fm.chained_from).toBe('task-1');
    expect(fm.chain_depth).toBe(2);
  });

  it('omits chain frontmatter when unset', () => {
    const md = buildWorkOrderMarkdown({
      id: 'task-3', title: 'Plain', provider: 'claude', model: 'm',
      timestamp: '2026-07-17T00:00:00.000Z', status: 'inbox',
    });
    const fm = store.parse('p', md).task.frontmatter;
    expect(fm.chain_template).toBeUndefined();
    expect(fm.chained_from).toBeUndefined();
    expect(fm.chain_depth).toBeUndefined();
  });

  it('buildWorkOrderFromTemplate carries provenance + inherited chain', () => {
    const md = buildWorkOrderFromTemplate({
      id: 'task-4', title: 'From tpl', status: 'ready', priority: '2 - normal',
      timestamp: '2026-07-17T00:00:00.000Z', provider: 'claude', model: 'm',
      conversationId: null, body: '# From tpl\n\n## Objective\n\nx',
      chain: { title: 'Nxt', trigger: 'review' }, chainedFrom: 'task-1', chainDepth: 1,
    });
    const fm = store.parse('p', md).task.frontmatter;
    expect(fm.chain_title).toBe('Nxt');
    expect(fm.chain_trigger).toBe('review');
    expect(fm.chained_from).toBe('task-1');
    expect(fm.chain_depth).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/unit/features/tasks/commands/taskCommands.test.ts -t "chain metadata"`
Expected: FAIL — builders don't accept/emit chain args.

- [ ] **Step 3: Implement**

In `src/features/tasks/commands/taskCommands.ts`:

Add the import:

```ts
import { chainConfigFrontmatterLines, type WorkOrderChainConfig } from '../model/workOrderChain';
```

Extend `FrontmatterArgs` (interface) with:

```ts
  chain?: WorkOrderChainConfig;
  chainedFrom?: string;
  chainDepth?: number;
```

In `workOrderFrontmatter`, build the extra lines before the `return`:

```ts
  const chainLines = args.chain ? `\n${chainConfigFrontmatterLines(args.chain).join('\n')}` : '';
  const chainedFromLine = args.chainedFrom ? `\nchained_from: ${JSON.stringify(args.chainedFrom)}` : '';
  const chainDepthLine = args.chainDepth !== undefined ? `\nchain_depth: ${args.chainDepth}` : '';
```

and append them to the returned YAML immediately after the `attempts: 0` line, before the closing `---`:

```ts
attempts: 0${chainLines}${chainedFromLine}${chainDepthLine}
---`;
```

Extend `BuildWorkOrderArgs` interface with the same three optional fields:

```ts
  chain?: WorkOrderChainConfig;
  chainedFrom?: string;
  chainDepth?: number;
```

In `buildWorkOrderMarkdown`, pass them into the `workOrderFrontmatter({ ... })` call:

```ts
    chain: args.chain,
    chainedFrom: args.chainedFrom,
    chainDepth: args.chainDepth,
```

In `buildWorkOrderFromTemplate`, its `args` already spreads into `workOrderFrontmatter`; ensure the function's parameter type includes the chain fields. It is typed `FrontmatterArgs & { body: string }`, so the fields already flow through — no change beyond `FrontmatterArgs` above. Confirm the call `workOrderFrontmatter(normalizedArgs)` forwards them (it spreads `...args`).

Now extend `WorkOrderSeed` (interface) with:

```ts
  titleOverride?: string;
  provider?: string;
  model?: string;
  agent?: string;
  chain?: WorkOrderChainConfig;
  chainedFrom?: string;
  chainDepth?: number;
```

In `WorkOrderMarkdownBuilders` (`commands/workOrderResolution.ts`) the `fromSeed`/`fromTemplate` arg shapes must accept the new fields. Update `commands/workOrderResolution.ts` `WorkOrderMarkdownBuilders.fromSeed` and `.fromTemplate` arg types to add:

```ts
    chain?: import('../model/workOrderChain').WorkOrderChainConfig;
    chainedFrom?: string;
    chainDepth?: number;
```

and `WorkOrderMarkdownContext` to add `chain?`, `chainedFrom?`, `chainDepth?`, `provider?`, `model?`, `agent?`, `titleOverride?` (only those `buildWorkOrderMarkdownForSeed` forwards — see below).

In `buildWorkOrderMarkdownForSeed` (workOrderResolution.ts) forward the chain/provenance fields in BOTH the `fromSeed` and `fromTemplate` calls, e.g. add to each object literal:

```ts
      chain: ctx.chain,
      chainedFrom: ctx.chainedFrom,
      chainDepth: ctx.chainDepth,
```

In `taskCommands.createWorkOrderFromSeed`:

Change the title-precedence line from:

```ts
  const title = template?.name?.trim() || seed.title || 'New work order';
```

to:

```ts
  const title = seed.titleOverride?.trim() || template?.name?.trim() || seed.title || 'New work order';
```

Add a `postProcess` hook to `CreateWorkOrderOptions` (used by the coordinator to seed the chain content in the SAME create write — see Task 7):

```ts
export interface CreateWorkOrderOptions {
  status?: TaskStatus;
  reveal?: 'note' | 'none';
  template?: WorkOrderTemplate;
  /** Transforms the generated markdown before `vault.create`, e.g. to inject chain context so the note is created already seeded. No-op for existing callers. */
  postProcess?: (markdown: string) => string;
}
```

and in `createWorkOrderFromSeed`, replace the create line so the hook runs first:

```ts
  const finalMarkdown = options?.postProcess ? options.postProcess(markdown) : markdown;
  const filePath = uniquePath(plugin, normalizePath(`${folder}/${id}.md`));
  const created = await plugin.app.vault.create(filePath, finalMarkdown);
```

When no template, prefer the seed's provider/model over the resolved defaults so an inline chain successor inherits the predecessor's backend. Just before building the target, compute effective defaults:

```ts
  const inlineProvider = !template && seed.provider ? seed.provider : (resolveAgentBoardDefaultProvider(plugin.settings) ?? '');
  const inlineModel = !template && seed.model ? seed.model : (resolveAgentBoardDefaultModel(plugin.settings) ?? '');
```

and use `{ provider: inlineProvider, model: inlineModel }` as the `resolveRunTarget` defaults.

Pass the new fields into `buildWorkOrderMarkdownForSeed({ ... })`:

```ts
      chain: seed.chain,
      chainedFrom: seed.chainedFrom,
      chainDepth: seed.chainDepth,
```

(`agent` for the created note frontmatter: template-based creation already carries `template.agent` via the `fromTemplate` builder; for the inline branch add `agent` to the frontmatter by threading `seed.agent` — if the current `buildWorkOrderMarkdown` has no `agent` slot, add `agent?: string` to `FrontmatterArgs` usage in `buildWorkOrderMarkdown` and pass `agent: args.agent`. Keep this minimal: only wire `agent` for the inline branch if `seed.agent` is set.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- tests/unit/features/tasks/commands/taskCommands.test.ts -t "chain metadata"`
Expected: PASS. Also run the full taskCommands suite to catch regressions: `npm run test -- tests/unit/features/tasks/commands/taskCommands.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/commands/taskCommands.ts src/features/tasks/commands/workOrderResolution.ts tests/unit/features/tasks/commands/taskCommands.test.ts
git commit -m "feat(tasks): thread chain config, provenance, and titleOverride through creation"
```

---

## Task 5: Templates carry a default successor

**Files:**
- Modify: `src/features/tasks/templates/templateTypes.ts`
- Modify: `src/features/tasks/templates/TemplateNoteStore.ts`
- Modify: `src/features/tasks/commands/taskCommands.ts` (copy `template.chain` into the created note)
- Test: `tests/unit/features/tasks/templates/templateNoteStore.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/tasks/templates/templateNoteStore.test.ts (add)
import { TemplateNoteStore } from '../../../../../src/features/tasks/templates/TemplateNoteStore';

const store = new TemplateNoteStore();

it('parses chain_* into template.chain', () => {
  const content = `---
type: specorator-work-order-template
schema_version: 1
name: "Design stage"
chain_template: "Implement stage"
chain_trigger: done
---
# {{title}}
`;
  const tpl = store.parse('Agent Board/templates/design.md', content);
  expect(tpl.chain).toEqual({ template: 'Implement stage', trigger: 'done' });
});

it('build round-trips chain', () => {
  const md = store.build({ name: 'Design', body: '# x', chain: { title: 'N', trigger: 'review' } });
  expect(store.parse('p', md).chain).toEqual({ title: 'N', trigger: 'review' });
});

it('omits chain when unset', () => {
  const tpl = store.parse('p', `---\ntype: specorator-work-order-template\nschema_version: 1\nname: "X"\n---\n# x\n`);
  expect(tpl.chain).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/unit/features/tasks/templates/templateNoteStore.test.ts -t "chain"`
Expected: FAIL — `chain` not parsed/built.

- [ ] **Step 3: Implement**

`templateTypes.ts` — add to `WorkOrderTemplate`:

```ts
import type { WorkOrderChainConfig } from '../model/workOrderChain';
// ...
  /** Default successor chain inherited when a work order is created from this template. */
  chain?: WorkOrderChainConfig;
```

and to `SaveTemplateInput` (in `TemplateNoteStore.ts`):

```ts
  chain?: WorkOrderChainConfig;
```

`TemplateNoteStore.parse` — add `chain` to the returned object using the shared parser:

```ts
import { chainConfigFrontmatterLines, parseChainConfig, type WorkOrderChainConfig } from '../model/workOrderChain';
// ...
      chain: parseChainConfig(parsed.frontmatter) ?? undefined,
```

`TemplateNoteStore.build` — after the `agent` line and before `lines.push('---', ...)`:

```ts
    if (input.chain) {
      for (const line of chainConfigFrontmatterLines(input.chain)) lines.push(line);
    }
```

`taskCommands.createWorkOrderFromSeed` — when a template is picked, seed its chain into the created note. Just before building the markdown, merge:

```ts
  const seedChain = seed.chain ?? template?.chain;
```

and pass `chain: seedChain` into `buildWorkOrderMarkdownForSeed`'s ctx (replacing `chain: seed.chain`). This makes the normal "+ Add from template" flow also inherit the template's default successor.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- tests/unit/features/tasks/templates/templateNoteStore.test.ts -t "chain"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/templates/templateTypes.ts src/features/tasks/templates/TemplateNoteStore.ts src/features/tasks/commands/taskCommands.ts tests/unit/features/tasks/templates/templateNoteStore.test.ts
git commit -m "feat(tasks): templates declare a default successor, inherited on instantiation"
```

---

## Task 6: `WorkOrderChainCoordinator` + `buildSuccessorPlan`

**Files:**
- Create: `src/features/tasks/execution/WorkOrderChainCoordinator.ts`
- Test: `tests/unit/features/tasks/execution/workOrderChainCoordinator.test.ts`

`buildSuccessorPlan` (pure) decides skip-vs-create and computes title/objective/context/provenance. The coordinator wires it to `task:status-changed` with idempotency + in-flight + depth guards, and delegates I/O to injected deps.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/tasks/execution/workOrderChainCoordinator.test.ts
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
    if (plan.kind === 'skip') expect(plan.reason).toMatch(/depth/i);
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
    let handler: ((p: { taskId: string; path: string; status: string }) => void) | undefined;
    const created: unknown[] = [];
    const linked: Array<[string, string]> = [];
    const deps = {
      events: { on: (_e: string, h: typeof handler) => { handler = h; return () => { handler = undefined; }; } },
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
    return { fire: (status: string) => handler?.({ taskId: 'task-1', path: 'Agent Board/tasks/task-1.md', status }), deps, created, linked };
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/unit/features/tasks/execution/workOrderChainCoordinator.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/features/tasks/execution/WorkOrderChainCoordinator.ts
import { parseHandoffSections } from '../model/handoffSections';
import type { TaskEventMap } from '../events';
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
  const fm = args.predecessor.frontmatter as Record<string, unknown>;
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
      void this.handle(payload);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private async handle(payload: TaskEventMap['task:status-changed']): Promise<void> {
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
    const config = parseChainConfig(predecessor.frontmatter as Record<string, unknown>);
    if (!config || config.trigger !== payload.status) return;

    // Only a matching event reserves the path. has()+add() is synchronous (no await
    // between), so two concurrent MATCHING events still yield exactly one spawn.
    if (this.inFlight.has(payload.path)) return;
    this.inFlight.add(payload.path);
    try {
      const maxDepth = this.deps.readSettings().agentBoardMaxChainDepth ?? DEFAULT_MAX_DEPTH;
      let template: WorkOrderTemplate | undefined;
      if (config.template) {
        const templates = await this.deps.listTemplates();
        template = templates.find((t) => t.name === config.template);
        if (!template) {
          this.deps.showNotice(`Chain template "${config.template}" not found; creating a blank successor.`);
        }
      }

      const plan = buildSuccessorPlan({ predecessor, enteredStatus: payload.status, template, maxDepth });
      if (plan.kind === 'skip') {
        if (plan.reason.includes('depth')) {
          this.deps.showNotice(`Work order "${predecessor.frontmatter.title}": ${plan.reason}.`);
          await this.deps.appendLedger(predecessor, { timestamp: this.deps.now(), status: payload.status, message: `chain: ${plan.reason}` });
        } else {
          this.deps.logger.debug(`chain skip: ${plan.reason}`);
        }
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
    } catch (error) {
      this.deps.logger.error('chain: unexpected failure', error);
    } finally {
      this.inFlight.delete(payload.path);
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- tests/unit/features/tasks/execution/workOrderChainCoordinator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/execution/WorkOrderChainCoordinator.ts tests/unit/features/tasks/execution/workOrderChainCoordinator.test.ts
git commit -m "feat(tasks): WorkOrderChainCoordinator + pure buildSuccessorPlan"
```

---

## Task 7: Wire the coordinator in `main.ts`

**Files:**
- Modify: `src/main.ts` (in the same block that starts `CommitOnAcceptCoordinator`, ~line 173-209)
- Test: `tests/integration/features/tasks/workOrderChaining.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/integration/features/tasks/workOrderChaining.integration.test.ts
// Drive the coordinator with real TaskNoteStore + createSuccessor wiring over an
// in-memory vault, asserting: done → one ready successor seeded with the wikilink +
// next_action, chained_to stamped, and no duplicate on a repeated event.
// Model this on the existing tests/integration/features/tasks/* harness (fake vault
// adapter + TaskNoteStore). Cover BOTH a blank chain and a template-based chain
// (assert the template successor still gets the seeded context + honored overrides).
```

> Author this using the integration harness pattern already in `tests/integration/features/tasks/`. Assert:
> 1. A predecessor with `chain_title: "Impl"` + a written handoff, on a `task:status-changed {status:'done'}`, produces exactly one new note under the work-order folder with `status: ready`, `chained_from: <pred id>`, `chain_depth: 1`, and Context containing `Chained from [[...]]` + `**Next action:** ...`.
> 2. The predecessor now has `chained_to`.
> 3. Firing the same event again creates no second successor.
> 4. A template-based chain (`chain_template` pointing to a saved template, WITH a `chain_title` override) yields a successor whose body came from the template, whose Context has the seed, and whose title EQUALS the `chain_title` override — explicitly assert `title === override` AND `title !== template.name`. This is the end-to-end coverage of `createWorkOrderFromSeed`'s `titleOverride`-vs-template precedence + the `postProcess` seed that Task 4's builder-level unit tests don't reach (Task 4 review flagged this as the coverage gap to close here).
> 5. Single-write seeding: capture the content passed to `vault.create` (spy/fake adapter) and assert it is **already** `status: ready` AND already contains `Chained from [[...]]` — i.e. no create-then-modify window where a `ready` note lacks the seed.
> 6. Agent-only inheritance: an inline chain from a predecessor with `agent: roster:x` and no `provider`/`model` produces a successor whose `provider`/`model` come from the resolved agent target (stub `resolveAgentRunTarget`), NOT the board defaults, and that carries `agent: roster:x`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- --selectProjects integration tests/integration/features/tasks/workOrderChaining.integration.test.ts`
Expected: FAIL — coordinator not wired / assertions unmet.

- [ ] **Step 3: Implement the wiring**

In `src/main.ts`, inside the existing `{ const noteStore = new TaskNoteStore(); ... }` block (reuse that `noteStore`), after `this.commitOnAcceptCoordinator.start();` add:

```ts
      this.workOrderChainCoordinator = new WorkOrderChainCoordinator({
        events: this.events,
        loadTaskSpec: async (path) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (!file || !('vault' in file)) throw new Error('Work order file not found');
          const content = await this.app.vault.read(file as TFile);
          return noteStore.parse(path, content).task;
        },
        listTemplates: async () => {
          const folder = this.settings.agentBoardTemplateFolder || 'Agent Board/templates';
          const { templates } = await new TemplateNoteStore().list(this.app.vault, folder);
          return templates;
        },
        createSuccessor: async (plan) => {
          // Seed the chain context (+ objective override) INSIDE the single create
          // write via postProcess, so the note is never `ready`-but-un-seeded for the
          // auto-run queue to race (Codex review, spec §Successor creation Step 2).
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
            const target = await this.resolveAgentRunTarget(agentId);
            if (target) {
              provider = provider ?? target.providerId;
              model = model ?? target.model;
            }
          }
          const created = await createWorkOrderFromSeed(
            this,
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
          const content = await this.app.vault.read(created);
          return noteStore.parse(created.path, content).task;
        },
        linkSuccessor: async (predecessorPath, successorId, entry) => {
          const file = this.app.vault.getAbstractFileByPath(predecessorPath);
          if (!(file instanceof TFile)) return;
          // ONE atomic vault.process transform: stamp chained_to AND append the ledger
          // line together. vault.process serializes with RunSession's terminal note
          // finalization (which also uses vault.process on the `review` trigger), so
          // neither write is lost to a read+modify race.
          await this.app.vault.process(file, (content) => {
            let next = noteStore.writeChainLink(content, successorId, new Date().toISOString());
            try {
              next = noteStore.appendLedger(next, entry);
            } catch {
              // Note may lack the ledger region (hand-edited); still persist chained_to.
            }
            return next;
          });
        },
        appendLedger: async (task, entry) => {
          const file = this.app.vault.getAbstractFileByPath(task.path);
          if (!(file instanceof TFile)) return;
          await this.app.vault.process(file, (content) => {
            try {
              return noteStore.appendLedger(content, entry);
            } catch {
              return content; // hand-edited note without the ledger region; best-effort.
            }
          });
        },
        readSettings: () => this.settings,
        now: () => new Date().toISOString(),
        logger: this.logger.scope('tasks.chain'),
        showNotice: (message) => { new Notice(message); },
      });
      this.workOrderChainCoordinator.start();
      this.register(() => this.workOrderChainCoordinator?.stop());
```

Add the field on the plugin class (near `commitOnAcceptCoordinator`):

```ts
  workOrderChainCoordinator: WorkOrderChainCoordinator | null = null;
```

Add imports at the top of `main.ts`:

```ts
import { WorkOrderChainCoordinator } from './features/tasks/execution/WorkOrderChainCoordinator';
import { TemplateNoteStore } from './features/tasks/templates/TemplateNoteStore';
import { createWorkOrderFromSeed } from './features/tasks/commands/taskCommands';
```

(`TFile` and `Notice` are already imported; verify.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- --selectProjects integration tests/integration/features/tasks/workOrderChaining.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts tests/integration/features/tasks/workOrderChaining.integration.test.ts
git commit -m "feat(tasks): wire WorkOrderChainCoordinator at plugin level"
```

---

## Task 8: i18n keys

**Files:**
- Modify: `src/i18n/types/tasks.ts` (add the key literals to the `TasksTranslationKey` union)
- Modify: all 10 locale JSONs under `src/i18n/locales/` (they must stay structurally identical — `Record<Locale, typeof en>` enforces it)

Add these keys under a new `chainConfig` section and a `board.card.chainedBadge` label (English strings; the 9 non-en locales may carry the English string as a placeholder — `t()` falls back to English regardless, and identical structure keeps typecheck green).

- [ ] **Step 1: Add the key literals** to `src/i18n/types/tasks.ts` (append to the union):

```ts
  | 'tasks.chainConfig.title'
  | 'tasks.chainConfig.lead'
  | 'tasks.chainConfig.templateLabel'
  | 'tasks.chainConfig.templateNone'
  | 'tasks.chainConfig.titleLabel'
  | 'tasks.chainConfig.titlePlaceholder'
  | 'tasks.chainConfig.objectiveLabel'
  | 'tasks.chainConfig.objectivePlaceholder'
  | 'tasks.chainConfig.triggerLabel'
  | 'tasks.chainConfig.triggerDone'
  | 'tasks.chainConfig.triggerReview'
  | 'tasks.chainConfig.save'
  | 'tasks.chainConfig.clear'
  | 'tasks.chainConfig.cancel'
  | 'tasks.chainConfig.chipNone'
  | 'tasks.workOrderModal.fieldNextStep'
  | 'tasks.board.card.chainedBadge'
  | 'tasks.templateEditor.chainHeading'
```

- [ ] **Step 2: Add the strings to `src/i18n/locales/en.json`** — inside the `"tasks"` object, add a `"chainConfig"` block and the extra keys under `"workOrderModal"`, `"board.card"`, and `"templateEditor"`:

```json
"chainConfig": {
  "title": "Next work order",
  "lead": "When this work order finishes, create a successor — seeded with this one's handoff.",
  "templateLabel": "Template",
  "templateNone": "No template (blank)",
  "titleLabel": "Title override",
  "titlePlaceholder": "Defaults to the template name or \"<this> — next\"",
  "objectiveLabel": "Objective override",
  "objectivePlaceholder": "Optional objective for the successor",
  "triggerLabel": "Create it",
  "triggerDone": "After I accept (done)",
  "triggerReview": "When the agent hands off (review)",
  "save": "Save",
  "clear": "Clear chain",
  "cancel": "Cancel",
  "chipNone": "None"
}
```

Add `"fieldNextStep": "Next step"` to `tasks.workOrderModal`, `"chainedBadge": "Part of a chain"` to `tasks.board.card`, and `"chainHeading": "Default next step"` to `tasks.templateEditor`.

- [ ] **Step 3: Mirror the structure into the other 9 locales**

For each of `zh-CN, zh-TW, ja, ko, de, fr, es, ru, pt`.json, add the same keys with the same structure (translated where you can; English placeholder otherwise). The runtime falls back to English, but the keys must exist so `typeof <locale>` matches `typeof en`.

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (no locale-shape mismatch; no unknown-key errors when the UI tasks below use `t('tasks.chainConfig.*')`).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/types/tasks.ts src/i18n/locales/*.json
git commit -m "i18n(tasks): keys for chain config modal, next-step chip, chained badge"
```

---

## Task 9: `ChainConfigModal` + detail-modal "Next step" chip + wiring

**Files:**
- Create: `src/features/tasks/ui/ChainConfigModal.ts`
- Create: `src/features/tasks/ui/workOrderChainSummary.ts` (shared chip-label helpers, so the two editable call sites don't duplicate the logic)
- Modify: `src/features/tasks/ui/WorkOrderDetailModal.ts` (`WorkOrderFieldUpdate.chain`; callbacks `onConfigureChain` + `getChainSummary`)
- Modify: `src/features/tasks/ui/vue/components/WorkOrderProperties.vue` (the chip, gated on `onConfigureChain`)
- Modify: `src/features/tasks/ui/AgentBoardView.ts` (wire `onConfigureChain`/`getChainSummary` in both `buildCallbacks` and `openDetail`)
- Modify: `src/features/tasks/ui/WorkOrderActivityProvider.ts` (wire the SAME two callbacks — it opens the same editable modal and already wires `onSaveFields`)
- Test: `tests/vue/tasks/workOrderDetail.test.ts` (extend — assert the chip renders the summary, invokes `onConfigureChain`, and is NOT a button when `onConfigureChain` is absent)

- [ ] **Step 1: Build `ChainConfigModal`** (mirrors `LoopEditorModal`; Obsidian-native per ADR 0006)

```ts
// src/features/tasks/ui/ChainConfigModal.ts
import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { DEFAULT_CHAIN_TRIGGER, type ChainTrigger, type WorkOrderChainConfig } from '../model/workOrderChain';
import { TemplateNoteStore } from '../templates/TemplateNoteStore';

/** Resolves to the new config, `null` to clear the chain, or `undefined` when cancelled. */
export type ChainConfigResult = WorkOrderChainConfig | null | undefined;

export class ChainConfigModal extends Modal {
  private settled = false;
  private template = this.current?.template ?? '';
  private title = this.current?.title ?? '';
  private objective = this.current?.objective ?? '';
  private trigger: ChainTrigger = this.current?.trigger ?? DEFAULT_CHAIN_TRIGGER;

  constructor(
    app: App,
    private readonly plugin: SpecoratorPlugin,
    private readonly current: WorkOrderChainConfig | undefined,
    private readonly resolve: (result: ChainConfigResult) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(t('tasks.chainConfig.title'));
    this.modalEl.addClass('specorator-sp-modal');
    this.contentEl.createEl('p', { text: t('tasks.chainConfig.lead') });

    void this.renderTemplateRow();

    new Setting(this.contentEl)
      .setName(t('tasks.chainConfig.titleLabel'))
      .addText((tc) => tc.setPlaceholder(t('tasks.chainConfig.titlePlaceholder')).setValue(this.title).onChange((v) => { this.title = v; }));

    new Setting(this.contentEl)
      .setName(t('tasks.chainConfig.objectiveLabel'))
      .addTextArea((ta) => { ta.setPlaceholder(t('tasks.chainConfig.objectivePlaceholder')).setValue(this.objective).onChange((v) => { this.objective = v; }); ta.inputEl.rows = 3; });

    new Setting(this.contentEl)
      .setName(t('tasks.chainConfig.triggerLabel'))
      .addDropdown((dd) => dd
        .addOption('done', t('tasks.chainConfig.triggerDone'))
        .addOption('review', t('tasks.chainConfig.triggerReview'))
        .setValue(this.trigger)
        .onChange((v) => { this.trigger = v === 'review' ? 'review' : 'done'; }));

    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText(t('tasks.chainConfig.save')).setCta().onClick(() => this.settle(this.collect())))
      .addButton((b) => b.setButtonText(t('tasks.chainConfig.clear')).setWarning().onClick(() => this.settle(null)))
      .addButton((b) => b.setButtonText(t('tasks.chainConfig.cancel')).onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
    window.setTimeout(() => { if (!this.settled) this.resolve(undefined); }, 0);
  }

  private async renderTemplateRow(): Promise<void> {
    const folder = this.plugin.settings.agentBoardTemplateFolder || 'Agent Board/templates';
    const { templates } = await new TemplateNoteStore().list(this.plugin.app.vault, folder);
    new Setting(this.contentEl)
      .setName(t('tasks.chainConfig.templateLabel'))
      .addDropdown((dd) => {
        dd.addOption('', t('tasks.chainConfig.templateNone'));
        for (const tpl of templates) dd.addOption(tpl.name, tpl.name);
        dd.setValue(this.template).onChange((v) => { this.template = v; });
      });
  }

  /** Null when nothing is configured (no template/title/objective) so an empty save clears. */
  private collect(): WorkOrderChainConfig | null {
    const template = this.template.trim() || undefined;
    const title = this.title.trim() || undefined;
    const objective = this.objective.trim() || undefined;
    if (!template && !title && !objective) return null;
    return { template, title, objective, trigger: this.trigger };
  }

  private settle(result: ChainConfigResult): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(result);
    this.close();
  }
}

export function chooseChainConfig(
  plugin: SpecoratorPlugin,
  current: WorkOrderChainConfig | undefined,
): Promise<ChainConfigResult> {
  return new Promise((resolve) => new ChainConfigModal(plugin.app, plugin, current, resolve).open());
}
```

- [ ] **Step 2: Extend the callbacks contract** in `WorkOrderDetailModal.ts`

Add to `WorkOrderFieldUpdate`:

```ts
  /** Successor chain config; explicit `null` clears it. */
  chain?: WorkOrderChainConfig | null;
```

(import `WorkOrderChainConfig` from `'../model/workOrderChain'`).

Add to `WorkOrderDetailModalCallbacks`:

```ts
  /** Open the chain-config modal, persist the result, and resolve to the new summary label (or undefined when cancelled). */
  onConfigureChain?(task: TaskSpec): Promise<string | undefined>;
  /** Sync summary label for the "Next step" chip ("None" when no chain). */
  getChainSummary?(task: TaskSpec): string;
```

- [ ] **Step 3: Add the chip** to `WorkOrderProperties.vue` — after the Loop `PropertyRow` block, mirroring it:

```vue
    <PropertyRow
      prop-key="chain"
      icon="link"
      :label="t('tasks.workOrderModal.fieldNextStep')"
    >
      <span
        v-if="assignEditable && canConfigureChain"
        class="specorator-work-order-modal-chip specorator-work-order-modal-chip--chain"
        role="button"
        tabindex="0"
        @click="configureChain"
        @keydown="onChainKeydown"
      >
        <span class="specorator-work-order-modal-chip-value">{{ chainLabel }}</span>
        <span :ref="(el) => mountLucide(el, 'chevron-down')" class="specorator-work-order-modal-chip-caret" />
      </span>
      <span v-else class="specorator-work-order-modal-loop">{{ chainLabel }}</span>
    </PropertyRow>
```

> Gating the interactive chip on `canConfigureChain` (not just `assignEditable`) means a call site that provides no `onConfigureChain` (e.g. a read-only surface) renders the static label instead of a dead button.

and in the `<script setup>`:

```ts
const canConfigureChain = computed(() => Boolean(cb.onConfigureChain));
const chainLabel = ref(cb.getChainSummary?.(props.task) ?? t('tasks.chainConfig.chipNone'));
function configureChain(): void {
  void (async () => {
    const summary = await cb.onConfigureChain?.(props.task);
    if (summary === undefined) return;
    chainLabel.value = summary;
  })();
}
function onChainKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    if (event.key === ' ') event.preventDefault();
    configureChain();
  }
}
```

- [ ] **Step 4: Wire the callbacks** in `AgentBoardView.ts`

First create the shared label helpers so both editable call sites (this and the activity provider) share one source of truth:

```ts
// src/features/tasks/ui/workOrderChainSummary.ts
import { t } from '../../../i18n/i18n';
import type { TaskSpec } from '../model/taskTypes';
import { parseChainConfig, type WorkOrderChainConfig } from '../model/workOrderChain';

/** Chip label for a parsed config. Objective-only chains are valid (Task 1), so fall
 *  back to the (truncated) objective before "None" — never show "None" for a
 *  configured chain. Appends "· on handoff" for the review trigger. */
export function chainSummaryFromConfig(config: WorkOrderChainConfig): string {
  const objective = config.objective && config.objective.length > 40
    ? `${config.objective.slice(0, 39)}…`
    : config.objective;
  const label = config.title ?? config.template ?? objective ?? t('tasks.chainConfig.chipNone');
  return config.trigger === 'review' ? `${label} · on handoff` : label;
}

export function chainSummaryForTask(task: TaskSpec): string {
  const config = parseChainConfig(task.frontmatter as Record<string, unknown>);
  return config ? chainSummaryFromConfig(config) : t('tasks.chainConfig.chipNone');
}
```

Then in `AgentBoardView.ts` add the configure handler (imports `chainSummaryForTask`, `chainSummaryFromConfig` from `'./workOrderChainSummary'`, `parseChainConfig` from `'../model/workOrderChain'`, `chooseChainConfig` from `'./ChainConfigModal'`, and `t`):

```ts
  private async configureChainForTask(task: TaskSpec): Promise<string | undefined> {
    const current = parseChainConfig(task.frontmatter as Record<string, unknown>) ?? undefined;
    const result = await chooseChainConfig(this.plugin, current);
    if (result === undefined) return undefined;
    await this.saveTaskFields(task, { chain: result });
    // saveTaskFields routes { chain } through noteStore.writeFields; its vault modify
    // event re-indexes the board. Return the just-saved summary so the chip updates
    // in place without waiting for a reload.
    return result ? chainSummaryFromConfig(result) : t('tasks.chainConfig.chipNone');
  }
```

and use `getChainSummary: (task) => chainSummaryForTask(task)` in the callbacks.

In `buildCallbacks()` add:

```ts
      onConfigureChain: (task) => this.configureChainForTask(task),
      getChainSummary: (task) => this.chainSummary(task),
```

In `openDetail()` add the same two to the `WorkOrderDetailModal` callbacks object.

- [ ] **Step 5: Wire the callbacks in `WorkOrderActivityProvider.ts`** — it opens the SAME editable `WorkOrderDetailModal` and already wires `onSaveFields`, so leaving the chain callbacks unwired would show "None" for a chained task there and (before the Step 3 gate) render a dead chip. Wire both, reusing the shared helper and the provider's existing `saveTaskFields`:

```ts
  private async configureChain(task: TaskSpec): Promise<string | undefined> {
    const current = parseChainConfig(task.frontmatter as Record<string, unknown>) ?? undefined;
    const result = await chooseChainConfig(this.plugin, current);
    if (result === undefined) return undefined;
    await this.saveTaskFields(task, { chain: result });
    return result ? chainSummaryFromConfig(result) : t('tasks.chainConfig.chipNone');
  }
```

and in the modal's callbacks object add:

```ts
      onConfigureChain: (task) => this.configureChain(task),
      getChainSummary: (task) => chainSummaryForTask(task),
```

Import `chainSummaryForTask`, `chainSummaryFromConfig` from `'./workOrderChainSummary'`, `parseChainConfig` from `'../model/workOrderChain'`, `chooseChainConfig` from `'./ChainConfigModal'`, and `t`.

- [ ] **Step 6: Add minimal CSS** for `--chain` chip parity — reuse the existing `.specorator-work-order-modal-chip` styles; no new rule needed unless a distinct color is wanted (skip for v1).

- [ ] **Step 7: Run tests + typecheck**

Run: `npm run typecheck:vue && npm run test:vue -- tasks/workOrderDetail` and `npm run typecheck`.
Expected: PASS (extend `workOrderDetail.test.ts` with a stub `getChainSummary`/`onConfigureChain` and assert the chip shows the summary and calls `onConfigureChain` on click).

- [ ] **Step 8: Commit**

```bash
git add src/features/tasks/ui/ChainConfigModal.ts src/features/tasks/ui/WorkOrderDetailModal.ts src/features/tasks/ui/vue/components/WorkOrderProperties.vue src/features/tasks/ui/AgentBoardView.ts src/features/tasks/ui/WorkOrderActivityProvider.ts tests/vue/tasks/workOrderDetail.test.ts
git commit -m "feat(tasks): configure a work order's successor chain from the detail modal"
```

---

## Task 10: Template editor — default successor fields

**Files:**
- Modify: `src/features/tasks/ui/workOrderTemplateEditorForm.ts` (`TemplateEditorForm` + `createInitialForm` + `buildTemplatePayload`)
- Modify: `src/features/tasks/ui/vue/WorkOrderTemplateEditorRoot.vue` (the fields)
- Test: `tests/unit/features/tasks/ui/workOrderTemplateEditorForm.test.ts` (extend/create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/features/tasks/ui/workOrderTemplateEditorForm.test.ts (add)
import { buildTemplatePayload, createInitialForm } from '../../../../../src/features/tasks/ui/workOrderTemplateEditorForm';

it('seeds chain fields from an existing template', () => {
  const form = createInitialForm({ path: 'p', name: 'T', body: 'b', chain: { template: 'Impl', trigger: 'review' } });
  expect(form.chainTemplate).toBe('Impl');
  expect(form.chainTrigger).toBe('review');
});

it('builds a chain in the payload only when a successor is configured', () => {
  const base = createInitialForm(null);
  expect(buildTemplatePayload({ ...base, name: 'T' }).chain).toBeUndefined();
  const withChain = buildTemplatePayload({ ...base, name: 'T', chainTemplate: 'Impl', chainTrigger: 'done' });
  expect(withChain.chain).toEqual({ template: 'Impl', trigger: 'done' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/unit/features/tasks/ui/workOrderTemplateEditorForm.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** in `workOrderTemplateEditorForm.ts`

Add to `TemplateEditorForm`:

```ts
  chainTemplate: string;
  chainTitle: string;
  chainObjective: string;
  chainTrigger: '' | ChainTrigger;
```

(import `type { ChainTrigger, WorkOrderChainConfig }` and `DEFAULT_CHAIN_TRIGGER` from `'../model/workOrderChain'`.)

In `createInitialForm`:

```ts
    chainTemplate: existing?.chain?.template ?? '',
    chainTitle: existing?.chain?.title ?? '',
    chainObjective: existing?.chain?.objective ?? '',
    chainTrigger: existing?.chain?.trigger ?? '',
```

In `buildTemplatePayload`, compute the chain and include it:

```ts
  const chainTemplate = form.chainTemplate.trim() || undefined;
  const chainTitle = form.chainTitle.trim() || undefined;
  const chainObjective = form.chainObjective.trim() || undefined;
  const chain: WorkOrderChainConfig | undefined =
    chainTemplate || chainTitle || chainObjective
      ? { template: chainTemplate, title: chainTitle, objective: chainObjective, trigger: form.chainTrigger || DEFAULT_CHAIN_TRIGGER }
      : undefined;
```

and add `chain,` to the returned payload object.

- [ ] **Step 4: Add the fields to `WorkOrderTemplateEditorRoot.vue`**

Add a "Default next step" section (mirror the existing loop/provider selects): a template `<select>` bound to `form.chainTemplate` (options loaded via a new `loadTemplateNameOptions(plugin)` helper listing template names, excluding this template's own name to avoid a trivial self-loop), a trigger `<select>` (`'' | 'done' | 'review'`, blank → default done), and text inputs for `chainTitle` / `chainObjective`. Label from `t('tasks.templateEditor.chainHeading')`.

> Add `loadTemplateNameOptions(plugin)` to `workOrderTemplateEditorForm.ts` mirroring `loadLoopOptions`, returning `{ value: name, label: name }[]` from `TemplateNoteStore.list`, filtered to exclude the currently-edited name.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test -- tests/unit/features/tasks/ui/workOrderTemplateEditorForm.test.ts` and `npm run typecheck:vue`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/tasks/ui/workOrderTemplateEditorForm.ts src/features/tasks/ui/vue/WorkOrderTemplateEditorRoot.vue tests/unit/features/tasks/ui/workOrderTemplateEditorForm.test.ts
git commit -m "feat(tasks): template editor declares a default successor chain"
```

---

## Task 11: Card chain indicator

**Files:**
- Modify: `src/features/tasks/ui/vue/components/WorkOrderCard.vue`
- Modify: `src/style/features/agent-board.css` (a small badge rule)
- Test: `tests/vue/tasks/*.test.ts` (extend a card test to assert the badge shows only when chained/chain-configured)

- [ ] **Step 1: Write the failing test**

Extend the existing card component test (or add `tests/vue/tasks/workOrderCardChain.test.ts`): mount `WorkOrderCard` with a task whose frontmatter has `chain_title` (or `chained_to`) and assert an element with class `specorator-agent-board-card-chain` exists; mount one without and assert it does not.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:vue -- tasks/workOrderCardChain`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `WorkOrderCard.vue` `<script setup>`:

```ts
const isChained = computed(() => {
  const fm = props.task.frontmatter as Record<string, unknown>;
  return Boolean(fm.chain_template || fm.chain_title || fm.chain_objective || fm.chained_to || fm.chained_from);
});
```

In the title row, after the title `div`, add:

```vue
      <span
        v-if="isChained"
        :ref="(el) => mountLucide(el, 'link')"
        class="specorator-agent-board-card-chain"
        :title="t('tasks.board.card.chainedBadge')"
        :aria-label="t('tasks.board.card.chainedBadge')"
      />
```

Import `mountLucide` from `'../mountLucide'` (as other components do) and `computed` (already imported).

- [ ] **Step 4: Add CSS** in `src/style/features/agent-board.css`:

```css
.specorator-agent-board-card-chain {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  color: var(--text-muted);
  opacity: 0.75;
}
.specorator-agent-board-card-chain svg { width: 13px; height: 13px; }
```

- [ ] **Step 5: Run tests**

Run: `npm run test:vue -- tasks/workOrderCardChain` and `npm run typecheck:vue`.
Expected: PASS. Also run `npm run check:css` to confirm no new `!important`.

- [ ] **Step 6: Commit**

```bash
git add src/features/tasks/ui/vue/components/WorkOrderCard.vue src/style/features/agent-board.css tests/vue/tasks/workOrderCardChain.test.ts
git commit -m "feat(tasks): show a chain indicator on workflow work-order cards"
```

---

## Task 12: Docs + full verification

**Files:**
- Modify: `src/features/tasks/CLAUDE.md`

- [ ] **Step 1: Document the feature** in `src/features/tasks/CLAUDE.md`

Add a short "Work-order chaining" subsection under the components list: the `chain_*` frontmatter (template/title/objective/trigger) + provenance (`chained_from`/`chained_to`/`chain_depth`); the plugin-level `WorkOrderChainCoordinator` subscribed to `task:status-changed` (mirrors `CommitOnAcceptCoordinator`); successor creation reusing `createWorkOrderFromSeed` + `writeChainContext`/`writeSections`; the `chained_to` idempotency guard + `agentBoardMaxChainDepth` (default 25) cap; and the note that re-triggering after a reopen requires clearing `chained_to`.

- [ ] **Step 2: Run the full gate**

Run: `npm run typecheck && npm run typecheck:vue && npm run lint && npm run test && npm run test:vue && npm run build`
Expected: all PASS. If `npm run check:loc` / `npm run check:quality` are part of CI, run them too and address any ratchet regressions (new files may need a baseline bump — see `docs/build-ci/quality-gates.md`).

- [ ] **Step 3: Commit**

```bash
git add src/features/tasks/CLAUDE.md
git commit -m "docs(tasks): document work-order chaining"
```

- [ ] **Step 4: Push**

```bash
git push origin claude/workflow-work-order-chaining-30xfyy
```

---

## Self-review notes (for the implementer)

- **Objective-only chains must spawn** (Task 1 predicate + Task 6 plan). Verify the integration test covers an objective-only predecessor.
- **Template-branch parity** (Task 6/7): a template-based successor MUST end up with the seeded Context and honored title/objective — that is the whole point of the two-step create+inject. The integration test asserts it for both branches.
- **Idempotency** is `chained_to` (persistent) + the in-flight `Set` (same-tick). Do not spawn twice.
- **Type names** used across tasks: `WorkOrderChainConfig`, `ChainTrigger`, `DEFAULT_CHAIN_TRIGGER`, `parseChainConfig`, `chainConfigFrontmatterLines`, `buildSuccessorPlan`, `SuccessorPlan`, `WorkOrderChainCoordinator`, `writeChainLink`, `writeChainContext`. Keep these exact.
- **No `console.*` in `src/`**, **no `v-html`/`innerHTML`**, markdown via `MarkdownRenderer`, DOM via `createEl`/`setIcon`.
