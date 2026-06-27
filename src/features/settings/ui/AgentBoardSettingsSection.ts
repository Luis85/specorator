import type { DropdownComponent } from 'obsidian';
import { Notice, Setting } from 'obsidian';

import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import type { ProviderId } from '../../../core/providers/types';
import { asSettingsBag } from '../../../core/types/settings';
import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { resolveAgentBoardDefaultProvider } from '../../tasks/defaultProviderResolver';
import { installPresetLoopsWithNotice } from '../../tasks/loops/installPresetLoops';
import { installPresetTemplatesWithNotice } from '../../tasks/templates/installPresetTemplates';
import { renderAgentBoardLaneEditor } from '../../tasks/ui/AgentBoardLaneEditor';

/**
 * Pick the provider the Agent Board should display and run. Keeps the stored choice when it is
 * still enabled; otherwise falls back to the first enabled provider so the provider dropdown and
 * the model dropdown never disagree about which provider is active.
 */
// Return type is `ProviderId` (an alias for `string`); a `| ''` constituent
// would be redundant since `''` is already a `string`. The empty-string value
// (no enabled provider) is still produced at runtime via the `?? ''` fallback.
export function resolveAgentBoardProvider(enabled: ProviderId[], stored: string): ProviderId {
  return enabled.includes(stored) ? stored : (enabled[0] ?? '');
}

export function renderAgentBoardSettingsSection(
  container: HTMLElement,
  plugin: SpecoratorPlugin,
): void {
  const normalizeFolder = (value: string): string => (value || '').replace(/^\/+|\/+$/g, '');

  // eslint-disable-next-line prefer-const -- assigned after creation to render after template folder
  let folderWarning!: Setting;
  const refreshFolderWarning = (): void => {
    const same =
      normalizeFolder(plugin.settings.agentBoardTemplateFolder) ===
      normalizeFolder(plugin.settings.agentBoardWorkOrderFolder);
    folderWarning.setDesc(
      same
        ? 'Warning: the template folder matches the work order folder, so templates will appear as invalid notes on the board.'
        : '',
    );
    if (same) {
      folderWarning.settingEl.show();
    } else {
      folderWarning.settingEl.hide();
    }
  };

  new Setting(container)
    .setName('Work order folder')
    .setDesc('Folder where new Agent Board work orders are created.')
    .addText((text) =>
      text
        .setPlaceholder('Agent Board/tasks')
        .setValue(plugin.settings.agentBoardWorkOrderFolder)
        .onChange(async (value) => {
          plugin.settings.agentBoardWorkOrderFolder = value.trim();
          await plugin.saveSettings();
          plugin.events.emit('task:board-config-changed');
          refreshFolderWarning();
        }),
    );

  new Setting(container)
    .setName('Template folder')
    .setDesc('Folder where work-order templates live.')
    .addText((text) =>
      text
        .setPlaceholder('Agent Board/templates')
        .setValue(plugin.settings.agentBoardTemplateFolder)
        .onChange(async (value) => {
          plugin.settings.agentBoardTemplateFolder = value.trim();
          await plugin.saveSettings();
          refreshFolderWarning();
        }),
    );

  folderWarning = new Setting(container).setName('');
  refreshFolderWarning();

  new Setting(container)
    .setName('Common templates')
    .setDesc('Install the starter set (bug fix, feature, refactor, research spike, documentation, test backfill). Re-running skips any whose filename already exists.')
    .addButton((btn) => {
      btn.setButtonText('Install').onClick(async () => {
        btn.setDisabled(true);
        try {
          await installPresetTemplatesWithNotice(plugin);
        } catch (error) {
          new Notice(t('settings.agentBoard.installFailed', { error: error instanceof Error ? error.message : String(error) }));
        } finally {
          btn.setDisabled(false);
        }
      });
    });

  new Setting(container)
    .setName(t('settings.agentBoard.loopFolderName'))
    .setDesc(t('settings.agentBoard.loopFolderDesc'))
    .addText((text) =>
      text
        .setPlaceholder('Agent Board/loops')
        .setValue(plugin.settings.agentBoardLoopFolder)
        .onChange(async (value) => {
          plugin.settings.agentBoardLoopFolder = value.trim();
          await plugin.saveSettings();
        }),
    );

  new Setting(container)
    .setName(t('settings.agentBoard.installLoopsName'))
    .setDesc(t('settings.agentBoard.installLoopsDesc'))
    .addButton((btn) => {
      btn.setButtonText('Install').onClick(async () => {
        btn.setDisabled(true);
        try {
          await installPresetLoopsWithNotice(plugin);
        } catch (error) {
          new Notice(t('settings.agentBoard.installFailed', { error: error instanceof Error ? error.message : String(error) }));
        } finally {
          btn.setDisabled(false);
        }
      });
    });

  new Setting(container)
    .setName('Archive folder')
    .setDesc('Folder where archived Agent Board work orders are moved. Keep it outside the work order folder.')
    .addText((text) =>
      text
        .setPlaceholder('Agent Board/archive')
        .setValue(plugin.settings.agentBoardArchiveFolder)
        .onChange(async (value) => {
          plugin.settings.agentBoardArchiveFolder = value.trim();
          await plugin.saveSettings();
        }),
    );

  const settings = asSettingsBag(plugin.settings);

  let modelDropdown: DropdownComponent | null = null;

  const populateModels = (providerId: string): void => {
    if (!modelDropdown) return;
    modelDropdown.selectEl.empty();
    modelDropdown.addOption('', 'Provider default');
    const options = providerId
      ? ProviderRegistry.getChatUIConfig(providerId).getModelOptions(settings)
      : [];
    for (const option of options) {
      modelDropdown.addOption(option.value, option.label);
    }
    const current = plugin.settings.agentBoardDefaultModel ?? '';
    modelDropdown.setValue(options.some((option) => option.value === current) ? current : '');
  };

  // Resolve once so the provider dropdown, the persisted setting, and the model dropdown all agree.
  // Without this, a stored-but-disabled provider (e.g. the default codex when only cursor is
  // enabled) would be shown via setValue without persisting, so models populated for the stale
  // provider and never refreshed for the displayed one.
  const selectedProvider = resolveAgentBoardDefaultProvider(plugin.settings) ?? '';
  if (selectedProvider && selectedProvider !== plugin.settings.agentBoardDefaultProvider) {
    plugin.settings.agentBoardDefaultProvider = selectedProvider;
    void plugin.saveSettings();
  }

  new Setting(container)
    .setName('Default provider')
    .setDesc('Provider used to run new work orders.')
    .addDropdown((dropdown) => {
      for (const providerId of ProviderRegistry.getEnabledProviderIds(settings)) {
        dropdown.addOption(providerId, providerId);
      }
      dropdown.setValue(selectedProvider);
      dropdown.onChange(async (value) => {
        plugin.settings.agentBoardDefaultProvider = value;
        plugin.settings.agentBoardDefaultModel = '';
        await plugin.saveSettings();
        populateModels(value);
      });
    });

  new Setting(container)
    .setName('Default model')
    .setDesc('Model used to run new work orders.')
    .addDropdown((dropdown) => {
      modelDropdown = dropdown;
      populateModels(selectedProvider);
      dropdown.onChange(async (value) => {
        plugin.settings.agentBoardDefaultModel = value;
        await plugin.saveSettings();
      });
    });

  container.createEl('h4', { text: 'Board lanes' });
  renderAgentBoardLaneEditor(container, plugin);
}
