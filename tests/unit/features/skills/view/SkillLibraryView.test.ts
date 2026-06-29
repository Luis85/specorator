/**
 * @jest-environment jsdom
 */
import '../../../../../tests/setup/obsidianDom';

import type { SkillTabEntry } from '../../../../../src/features/quickActions/skills/types';
import { SkillLibraryView, VIEW_TYPE_SKILL_LIBRARY } from '../../../../../src/features/skills/view/SkillLibraryView';

// ── Module mocks ─────────────────────────────────────────────────────────────

const editorOpenMock = jest.fn();
jest.mock('../../../../../src/features/skills/view/SkillEditorModal', () => ({
  SkillEditorModal: jest.fn().mockImplementation(() => ({ open: editorOpenMock })),
}));

const runVaultSkillMock = jest.fn();
jest.mock('../../../../../src/features/quickActions/skills/runVaultSkill', () => ({
  runVaultSkill: (...args: unknown[]) => runVaultSkillMock(...args),
}));

// Suppress PromptModal so createSkill does not block
jest.mock('../../../../../src/shared/modals/PromptModal', () => ({
  promptReason: jest.fn().mockResolvedValue(null),
}));

// libraryNav expects openLeafView on plugin — provide a no-op
jest.mock('../../../../../src/shared/libraryNav', () => ({
  renderLibraryNav: jest.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTRY_EDITABLE: SkillTabEntry = {
  id: 'claude:skill-tdd',
  providerId: 'claude',
  providerDisplayName: 'Claude',
  name: 'TDD',
  description: 'Test-driven development skill.',
  insertPrefix: '$',
  sourceFilePath: '.claude/skills/tdd/SKILL.md',
  providerEnabled: true,
};

const ENTRY_READONLY: SkillTabEntry = {
  id: 'opencode:skill-plan',
  providerId: 'opencode',
  providerDisplayName: 'Opencode',
  name: 'Plan',
  description: 'Planning skill.',
  insertPrefix: '$',
  sourceFilePath: null,
  providerEnabled: true,
};

function makePlugin(entries: SkillTabEntry[], tagsForEditable?: string[]) {
  return {
    app: {},
    settings: {},
    logger: { scope: () => ({ error: jest.fn(), warn: jest.fn() }) },
    events: { emit: jest.fn() },
    vaultSkillAggregator: {
      listAll: jest.fn().mockResolvedValue(entries),
    },
    vaultFileAdapter: {
      read: jest.fn().mockImplementation(async (path: string) => {
        if (path === ENTRY_EDITABLE.sourceFilePath && tagsForEditable) {
          return `---\ntags:\n${tagsForEditable.map((t) => `  - ${t}`).join('\n')}\n---\n# TDD\n`;
        }
        return '# Skill\n';
      }),
      stat: jest.fn().mockResolvedValue({ mtime: 1000, size: 200 }),
      write: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    },
  } as any;
}

function makeView(plugin: any): { view: SkillLibraryView; contentEl: HTMLElement } {
  const view = new SkillLibraryView({} as any, plugin);
  const contentEl = document.createElement('div');
  (view as unknown as { contentEl: HTMLElement }).contentEl = contentEl;
  return { view, contentEl };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  editorOpenMock.mockClear();
  runVaultSkillMock.mockClear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SkillLibraryView', () => {
  it('exposes the stable view type and metadata', () => {
    const { view } = makeView(makePlugin([]));
    expect(VIEW_TYPE_SKILL_LIBRARY).toBe('specorator-skill-library');
    expect(view.getViewType()).toBe(VIEW_TYPE_SKILL_LIBRARY);
    expect(view.getIcon()).toBe('book-open');
    expect(view.getDisplayText()).toBeTruthy();
  });

  it('renders one card per skill', async () => {
    const { view, contentEl } = makeView(makePlugin([ENTRY_EDITABLE, ENTRY_READONLY]));
    await view.onOpen();
    await flush();
    const cards = contentEl.querySelectorAll('.specorator-library-card');
    expect(cards.length).toBe(2);
  });

  it('card name is a plain span inside the name row — NOT a standalone button', async () => {
    const { view, contentEl } = makeView(makePlugin([ENTRY_EDITABLE]));
    await view.onOpen();
    await flush();
    const nameRow = contentEl.querySelector('.specorator-library-card-name');
    expect(nameRow).not.toBeNull();
    // The name text is inside a span, not a button
    const nameSpan = nameRow!.querySelector('span');
    expect(nameSpan).not.toBeNull();
    expect(nameSpan!.textContent).toBe('TDD');
    // No button wraps the name
    expect(nameRow!.querySelector('button')).toBeNull();
  });

  it('card has role=button making the whole card interactive', async () => {
    const { view, contentEl } = makeView(makePlugin([ENTRY_EDITABLE]));
    await view.onOpen();
    await flush();
    const card = contentEl.querySelector('.specorator-library-card');
    expect(card).not.toBeNull();
    expect(card!.getAttribute('role')).toBe('button');
    expect(card!.getAttribute('tabindex')).toBe('0');
  });

  it('editable skill shows the provider chip only', async () => {
    const { view, contentEl } = makeView(makePlugin([ENTRY_EDITABLE]));
    await view.onOpen();
    await flush();
    const nameRow = contentEl.querySelector('.specorator-library-card-name');
    const chips = Array.from(nameRow!.querySelectorAll('.specorator-library-chip')).map((c) => c.textContent);
    expect(chips).toContain('Claude');
    // Read-only chip must NOT appear for an editable skill
    const outlineChips = nameRow!.querySelectorAll('.specorator-library-chip-outline');
    expect(outlineChips.length).toBe(0);
  });

  it('read-only skill shows an outline read-only chip in addition to the provider chip', async () => {
    const { view, contentEl } = makeView(makePlugin([ENTRY_READONLY]));
    await view.onOpen();
    await flush();
    const nameRow = contentEl.querySelector('.specorator-library-card-name');
    const chips = Array.from(nameRow!.querySelectorAll('.specorator-library-chip'));
    expect(chips.length).toBe(2);
    const outlineChip = nameRow!.querySelector('.specorator-library-chip-outline');
    expect(outlineChip).not.toBeNull();
  });

  it('skill with frontmatter tags renders tag chips in the caps div', async () => {
    const { view, contentEl } = makeView(makePlugin([ENTRY_EDITABLE], ['testing', 'workflow']));
    await view.onOpen();
    await flush();
    const caps = contentEl.querySelector('.specorator-library-card-caps');
    expect(caps).not.toBeNull();
    const tagChips = Array.from(caps!.querySelectorAll('.specorator-library-chip')).map((c) => c.textContent);
    expect(tagChips).toContain('testing');
    expect(tagChips).toContain('workflow');
  });

  it('tagless skill has NO empty caps div (guard removes it)', async () => {
    // The view calls caps.remove() when childElementCount === 0, so a skill
    // with no frontmatter tags must leave no .specorator-library-card-caps in the DOM.
    const { view, contentEl } = makeView(makePlugin([ENTRY_EDITABLE]));
    await view.onOpen();
    await flush();
    expect(contentEl.querySelector('.specorator-library-card-caps')).toBeNull();
  });

  it('Prompt button calls runVaultSkill with the matching entry', async () => {
    const { view, contentEl } = makeView(makePlugin([ENTRY_EDITABLE]));
    await view.onOpen();
    await flush();
    const promptBtn = Array.from(contentEl.querySelectorAll('button')).find(
      (b) => b.className.includes('mod-cta') && b.closest('.specorator-library-card-actions'),
    ) as HTMLButtonElement;
    expect(promptBtn).toBeDefined();
    promptBtn.click();
    expect(runVaultSkillMock).toHaveBeenCalledTimes(1);
    expect(runVaultSkillMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ id: ENTRY_EDITABLE.id }),
    );
  });

  it('clicking the card opens the SkillEditorModal', async () => {
    const { view, contentEl } = makeView(makePlugin([ENTRY_EDITABLE]));
    await view.onOpen();
    await flush();
    const card = contentEl.querySelector('.specorator-library-card') as HTMLElement;
    card.click();
    expect(editorOpenMock).toHaveBeenCalledTimes(1);
  });

  it('toolbar search input renders', async () => {
    const { view, contentEl } = makeView(makePlugin([ENTRY_EDITABLE]));
    await view.onOpen();
    await flush();
    const searchInput = contentEl.querySelector('.specorator-library-search');
    expect(searchInput).not.toBeNull();
  });

  it('renders the New skill button in the header', async () => {
    const { view, contentEl } = makeView(makePlugin([]));
    await view.onOpen();
    await flush();
    const newBtn = contentEl.querySelector('.specorator-library-header-actions .mod-cta');
    expect(newBtn).not.toBeNull();
  });

  it('renders the empty state when there are no skills', async () => {
    const { view, contentEl } = makeView(makePlugin([]));
    await view.onOpen();
    await flush();
    const empty = contentEl.querySelector('.specorator-library-empty');
    expect(empty).not.toBeNull();
    expect(contentEl.querySelectorAll('.specorator-library-card').length).toBe(0);
  });
});
