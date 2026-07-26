import { createMockEl } from '@test/helpers/mockElement';
import { Setting } from 'obsidian';

import { renderHiddenProviderCommandsSetting } from '@/shared/settings/HiddenProviderCommandsSetting';

/** Fires the onChange the mock Setting captured on the last-rendered textarea. */
async function fireLastTextareaChange(value: string): Promise<void> {
  const setting = (Setting as unknown as { instances: Array<{ components: Array<{ kind: string; props: { changeHandler: (v: string) => Promise<void> } }> }> }).instances.at(-1);
  const textarea = setting?.components.find((c) => c.kind === 'textarea');
  await textarea?.props.changeHandler(value);
}

describe('renderHiddenProviderCommandsSetting — broadcast reaches every chat host', () => {
  beforeEach(() => {
    (Setting as unknown as { instances: unknown[] }).instances = [];
  });

  // Round-36 Fix 1b: the live hidden-command settings handler broadcast only to
  // plugin.getView() (the sidebar), so an open Team Chat DM never learned a command
  // was hidden. It must fan out through getAllViews() so every chat host is reached.
  it('applies the hidden-command update to EVERY getAllViews() host, not only the sidebar', async () => {
    const sidebar = { updateHiddenProviderCommands: jest.fn() };
    const teamChat = { updateHiddenProviderCommands: jest.fn() };
    const plugin = {
      settings: { hiddenProviderCommands: {} },
      saveSettings: jest.fn().mockResolvedValue(undefined),
      getView: jest.fn(() => sidebar),
      getAllViews: jest.fn(() => [sidebar, teamChat]),
    } as never;

    renderHiddenProviderCommandsSetting(plugin, createMockEl() as unknown as HTMLElement, 'claude', {
      name: 'n',
      desc: 'd',
      placeholder: 'p',
    });
    await fireLastTextareaChange('commit');

    expect((plugin as unknown as { saveSettings: jest.Mock }).saveSettings).toHaveBeenCalledTimes(1);
    // The Team Chat host is reached — the pre-fix getView()-only broadcast skipped it.
    expect(teamChat.updateHiddenProviderCommands).toHaveBeenCalledTimes(1);
    expect(sidebar.updateHiddenProviderCommands).toHaveBeenCalledTimes(1);
  });
});
