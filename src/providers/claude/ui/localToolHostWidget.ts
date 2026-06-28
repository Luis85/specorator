import { Notice, Setting } from 'obsidian';

import type { ProviderSettingsWidgetMount } from '../../../core/providers/settingsWidgets';
import { asSettingsBag } from '../../../core/types';
import type { PluginContext } from '../../../core/types/PluginContext';
import { t } from '../../../i18n/i18n';
import type { CatalogPayload } from '../../../tool-host/types';
import { findNodeExecutable, getEnhancedPath } from '../../../utils/env';
import { getClaudeProviderSettings, updateClaudeProviderSettings } from '../settings';
import { isSupportedNode, probeNodeMajor } from '../toolHost/nodeVersion';

/**
 * Node present on PATH AND at or above the host's minimum major (18). Resolves
 * the enhanced PATH the same way the runtime does (provider-configured env PATH
 * + CLI dir), so the pre-enable toggle check matches the runtime's resolution
 * and doesn't wrongly block when Node is only on the provider's Environment PATH.
 */
async function nodeSupported(plugin: PluginContext): Promise<boolean> {
  const customEnv = plugin.getResolvedEnvironmentVariables('claude');
  const cliPath = plugin.getResolvedProviderCliPath('claude') ?? '';
  const enhancedPath = getEnhancedPath(customEnv.PATH, cliPath);
  const nodePath = findNodeExecutable(enhancedPath);
  return !!nodePath && isSupportedNode(await probeNodeMajor(nodePath));
}

export const mountClaudeLocalToolHostSection: ProviderSettingsWidgetMount = (host, context) => {
  const plugin = context.plugin;
  const settingsBag = asSettingsBag(plugin.settings);
  const claude = getClaudeProviderSettings(settingsBag);

  host.createEl('p', { text: t('settings.localToolHost.desc'), cls: 'setting-item-description' });

  new Setting(host)
    .setName(t('settings.localToolHost.enable'))
    .addToggle((toggle) =>
      toggle.setValue(claude.localToolHostEnabled).onChange(async (value) => {
        // Never persist `true` without a supported Node (>=18) — revert and warn.
        if (value && !(await nodeSupported(plugin))) {
          toggle.setValue(false);
          new Notice(t('settings.localToolHost.nodeUnsupported'));
          return;
        }
        updateClaudeProviderSettings(settingsBag, { localToolHostEnabled: value });
        await plugin.saveSettings();
        await plugin.reloadLocalToolHost();
        context.requestRefresh();
      }),
    );

  if (!claude.localToolHostEnabled) return;

  const listEl = host.createDiv({ cls: 'specorator-tool-host-list' });

  // refreshAll is defined below; setDisabled (defined in renderList) calls it at click time.
  const renderList = (catalog: CatalogPayload) => {
    listEl.empty();
    const disabledFiles = getClaudeProviderSettings(settingsBag).localToolHostDisabledFiles;

    const setDisabled = async (file: string, disabled: boolean) => {
      const next = new Set(getClaudeProviderSettings(settingsBag).localToolHostDisabledFiles);
      if (disabled) next.add(file);
      else next.delete(file);
      updateClaudeProviderSettings(settingsBag, { localToolHostDisabledFiles: [...next] });
      await plugin.saveSettings();
      await refreshAll(); // one scan: re-spawn host with the new disabled set + re-render
    };

    if (catalog.tools.length === 0 && catalog.errors.length === 0 && disabledFiles.length === 0) {
      listEl.createEl('p', {
        text: t('settings.localToolHost.noTools'),
        cls: 'setting-item-description',
      });
      return;
    }
    // Enabled tools come from the catalog (which excludes disabled — they're never imported).
    for (const tool of catalog.tools) {
      new Setting(listEl)
        .setName(tool.name)
        .setDesc(tool.description)
        .addToggle((toggle) =>
          toggle.setValue(true).onChange(() => void setDisabled(tool.file, true)),
        );
    }
    // Disabled tools are shown by FILENAME only — never imported, so no name/description is available.
    for (const file of disabledFiles) {
      new Setting(listEl)
        .setName(file)
        .setDesc(t('settings.localToolHost.disabledHint'))
        .addToggle((toggle) =>
          toggle.setValue(false).onChange(() => void setDisabled(file, false)),
        );
    }
    for (const err of catalog.errors) {
      new Setting(listEl)
        .setName(`${t('settings.localToolHost.loadError')}: ${err.file}`)
        .setDesc(err.message);
    }
  };

  // reloadLocalToolHost owns the SINGLE materialize + catalog scan and returns the scan, so
  // opening settings / Reload performs exactly one scan (not two). `catalog` is null when Node is
  // missing/old OR when the catalog scan failed (feature inert / builder stays disabled); a clean
  // empty-dir scan returns an empty (non-null) catalog so "no tools" still renders.
  const refreshAll = async () => {
    const { catalog } = await plugin.reloadLocalToolHost();
    if (!catalog) {
      listEl.empty();
      listEl.createEl('p', {
        text: t('settings.localToolHost.nodeUnsupported'),
        cls: 'setting-item-description mod-warning',
      });
      return;
    }
    renderList(catalog);
  };

  new Setting(host).addButton((btn) =>
    btn.setButtonText(t('settings.localToolHost.reload')).onClick(refreshAll),
  );

  void refreshAll();
};
