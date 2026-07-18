import { Notice, Setting } from 'obsidian';

import type { WorkOrderChainConfig } from '../../../../../src/features/tasks/model/workOrderChain';
import {
  buildChainConfig,
  type ChainConfigForm,
  ChainConfigModal,
  initialChainForm,
} from '../../../../../src/features/tasks/ui/ChainConfigModal';

// The mock Setting tracks all instances in a static array (see LoopEditorModal.test.ts).
type MockSetting = InstanceType<typeof Setting> & {
  components: {
    kind: string;
    props: {
      buttonText?: string;
      clickHandler?: () => void | Promise<void>;
      value?: string;
      changeHandler?: (v: string) => void;
    };
  }[];
};
const settingInstances = (): MockSetting[] =>
  (Setting as unknown as { instances: MockSetting[] }).instances;

// Retrieve all button components (Save, Clear, Cancel, in that render order).
function buttonComponents(): Array<{ buttonText: string; clickHandler: () => void | Promise<void> }> {
  return settingInstances()
    .flatMap((s) => s.components)
    .filter((c) => c.kind === 'button')
    .map((c) => c.props as { buttonText: string; clickHandler: () => void | Promise<void> });
}

// Retrieve all text (non-area) components — just the Title override field here.
function textComponents(): Array<{ value: string; changeHandler: (v: string) => void }> {
  return settingInstances()
    .flatMap((s) => s.components)
    .filter((c) => c.kind === 'text')
    .map((c) => c.props as { value: string; changeHandler: (v: string) => void });
}

// Retrieve all dropdown components — the Trigger field (the async Template row
// isn't awaited in these tests, so it never contributes one).
function dropdownComponents(): Array<{ value: string; changeHandler: (v: string) => void }> {
  return settingInstances()
    .flatMap((s) => s.components)
    .filter((c) => c.kind === 'dropdown')
    .map((c) => c.props as { value: string; changeHandler: (v: string) => void });
}

const mockApp: any = {};
// Minimal plugin stub: only what the async template-row render touches (an
// empty vault so TemplateNoteStore().list resolves without a real vault).
const mockPlugin: any = {
  settings: { agentBoardTemplateFolder: 'Agent Board/templates' },
  app: { vault: { getMarkdownFiles: () => [] } },
};

// The Obsidian mock's contentEl stub doesn't include .empty() (see LoopEditorModal.test.ts).
function patchContentElEmpty(modal: ChainConfigModal): void {
  const contentEl = (modal as unknown as { contentEl: any }).contentEl;
  if (!contentEl.empty || typeof contentEl.empty !== 'function') {
    contentEl.empty = jest.fn();
  }
}

beforeEach(() => {
  (Setting as unknown as { instances: unknown[] }).instances = [];
  (Notice as unknown as jest.Mock).mockClear();
});

// onOpen() fires the async template-row render without awaiting it (by design —
// see the comment above templateRowEl in ChainConfigModal.ts). Drain it after
// every test so a stray resolution can't inject a template Setting instance
// into a LATER test's (just-reset) Setting.instances array.
afterEach(async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
});

describe('initialChainForm — config to form', () => {
  it('defaults to blank fields and the done trigger when there is no existing config', () => {
    expect(initialChainForm(undefined)).toEqual({ template: '', title: '', objective: '', trigger: 'done' });
  });

  it('seeds every field from an existing config', () => {
    const existing: WorkOrderChainConfig = { template: 'Impl', title: 'Wire it', objective: 'Do it', trigger: 'done' };
    expect(initialChainForm(existing)).toEqual({ template: 'Impl', title: 'Wire it', objective: 'Do it', trigger: 'done' });
  });

  it('seeds the review trigger from an existing config', () => {
    const existing: WorkOrderChainConfig = { title: 'Only a title', trigger: 'review' };
    expect(initialChainForm(existing).trigger).toBe('review');
  });

  it('falls back missing fields to blank strings even with an existing config', () => {
    const existing: WorkOrderChainConfig = { title: 'Only a title', trigger: 'done' };
    const form = initialChainForm(existing);
    expect(form.template).toBe('');
    expect(form.objective).toBe('');
  });
});

describe('buildChainConfig — form to config', () => {
  const blank: ChainConfigForm = { template: '', title: '', objective: '', trigger: 'done' };

  it('resolves null when every field is blank', () => {
    expect(buildChainConfig(blank)).toBeNull();
  });

  it('resolves null when every field is whitespace-only', () => {
    expect(buildChainConfig({ template: '  ', title: '\t', objective: '   \n ', trigger: 'done' })).toBeNull();
  });

  it('trims whitespace on every text field', () => {
    const config = buildChainConfig({ template: '  Impl  ', title: '  Wire it  ', objective: '  Do it  ', trigger: 'done' });
    expect(config).toEqual({ template: 'Impl', title: 'Wire it', objective: 'Do it', trigger: 'done' });
  });

  it('omits a blank field as undefined rather than an empty string', () => {
    const config = buildChainConfig({ ...blank, template: 'Impl' });
    expect(config).toEqual({ template: 'Impl', title: undefined, objective: undefined, trigger: 'done' });
  });

  it('is configured from the objective alone', () => {
    const config = buildChainConfig({ ...blank, objective: 'Wire the successor.' });
    expect(config).toEqual({ template: undefined, title: undefined, objective: 'Wire the successor.', trigger: 'done' });
  });

  it('passes the review trigger through unchanged', () => {
    expect(buildChainConfig({ ...blank, title: 'X', trigger: 'review' })?.trigger).toBe('review');
  });

  it('passes the done trigger through unchanged', () => {
    expect(buildChainConfig({ ...blank, title: 'X', trigger: 'done' })?.trigger).toBe('done');
  });
});

describe('ChainConfigModal — Save / Clear / Cancel', () => {
  it('prefills the title field and trigger dropdown from an existing config', () => {
    const existing: WorkOrderChainConfig = { title: 'Existing successor', trigger: 'review' };
    const modal = new ChainConfigModal(mockApp, mockPlugin, existing, jest.fn());
    modal.onOpen();

    expect(textComponents()[0]?.value).toBe('Existing successor');
    expect(dropdownComponents()[0]?.value).toBe('review');
  });

  it('Save resolves the collected config from the edited form', async () => {
    const resolve = jest.fn();
    const modal = new ChainConfigModal(mockApp, mockPlugin, undefined, resolve);
    modal.onOpen();

    textComponents()[0]?.changeHandler('Wire it up');
    dropdownComponents()[0]?.changeHandler('review');

    const [saveBtn] = buttonComponents();
    await saveBtn.clickHandler();

    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ title: 'Wire it up', trigger: 'review' }));
    expect((modal.close as jest.Mock)).toHaveBeenCalled();
  });

  it('Save on an all-blank form warns and neither resolves nor closes (use Clear to remove a chain)', async () => {
    const resolve = jest.fn();
    const modal = new ChainConfigModal(mockApp, mockPlugin, undefined, resolve);
    modal.onOpen();

    const [saveBtn] = buttonComponents();
    await saveBtn.clickHandler();

    expect(resolve).not.toHaveBeenCalled();
    expect(modal.close as jest.Mock).not.toHaveBeenCalled();
    expect(Notice as unknown as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('Clear resolves null even when the form holds an existing, unsaved config', async () => {
    const resolve = jest.fn();
    const current: WorkOrderChainConfig = { title: 'Existing successor', trigger: 'review' };
    const modal = new ChainConfigModal(mockApp, mockPlugin, current, resolve);
    modal.onOpen();

    const [, clearBtn] = buttonComponents();
    await clearBtn.clickHandler();

    expect(resolve).toHaveBeenCalledWith(null);
    expect((modal.close as jest.Mock)).toHaveBeenCalled();
  });

  it('Cancel does not resolve synchronously — the fallback is deferred to onClose', () => {
    const resolve = jest.fn();
    const modal = new ChainConfigModal(mockApp, mockPlugin, undefined, resolve);
    modal.onOpen();

    const [, , cancelBtn] = buttonComponents();
    cancelBtn.clickHandler();

    expect(resolve).not.toHaveBeenCalled();
    expect((modal.close as jest.Mock)).toHaveBeenCalled();
  });

  it('resolves undefined via the deferred setTimeout path when closed without a choice', async () => {
    jest.useFakeTimers();
    const result = await new Promise((resolve) => {
      const modal = new ChainConfigModal(mockApp, mockPlugin, undefined, resolve);
      patchContentElEmpty(modal);
      modal.onOpen();
      modal.onClose();
      jest.runAllTimers();
    });
    jest.useRealTimers();

    expect(result).toBeUndefined();
  });

  it('does not resolve undefined on close after a synchronous Save already settled', async () => {
    jest.useFakeTimers();
    const resolveResults: unknown[] = [];
    const modal = new ChainConfigModal(mockApp, mockPlugin, undefined, (r) => resolveResults.push(r));
    patchContentElEmpty(modal);
    modal.onOpen();

    textComponents()[0]?.changeHandler('A successor');
    const [saveBtn] = buttonComponents();
    await saveBtn.clickHandler();
    modal.onClose();
    jest.runAllTimers();
    jest.useRealTimers();

    expect(resolveResults).toEqual([expect.objectContaining({ title: 'A successor' })]);
  });
});
