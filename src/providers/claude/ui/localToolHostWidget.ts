import { Notice, SecretComponent, Setting } from 'obsidian';

import type { ProviderSettingsWidgetMount } from '../../../core/providers/settingsWidgets';
import { isSpecoratorGeneratedSecretId } from '../../../core/security/secretIds';
import { asSettingsBag } from '../../../core/types';
import type { PluginContext } from '../../../core/types/PluginContext';
import { t } from '../../../i18n/i18n';
import type { CatalogPayload } from '../../../tool-host/types';
import { curateStdioMcpEnv, findNodeExecutable, getEnhancedPath } from '../../../utils/env';
import { getClaudeProviderSettings, type ToolHostSecretRef,updateClaudeProviderSettings } from '../settings';
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
  // Probe with the curated env the host spawn uses, so a host-rejected NODE_OPTIONS
  // in process.env can't make a runnable Node look unsupported and block the toggle.
  return (
    !!nodePath &&
    isSupportedNode(await probeNodeMajor(nodePath, curateStdioMcpEnv({ PATH: enhancedPath })))
  );
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
        // On DISABLE, clear the runtime caches now — the remount returns early (no scan) when off.
        // On ENABLE, skip this: the remount's refreshAll performs the single scan (avoid a double
        // scan that would import every tool twice).
        if (!value) await plugin.reloadLocalToolHost();
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
      // A failing tool is still imported (its top-level code runs) on every spawn, so give the
      // user a toggle to disable it from Settings rather than forcing a file delete / JSON edit.
      new Setting(listEl)
        .setName(`${t('settings.localToolHost.loadError')}: ${err.file}`)
        .setDesc(err.message)
        .addToggle((toggle) =>
          toggle.setValue(true).onChange(() => void setDisabled(err.file, true)),
        );
    }
  };

  // reloadLocalToolHost owns the SINGLE materialize + catalog scan and returns the scan, so
  // opening settings / Reload performs exactly one scan (not two). A null catalog has TWO distinct
  // causes that need different remediation: `scanFailed` means Node ran but a tool script errored/
  // timed out during `--catalog` (point the user at the log + Reload), whereas a plain null catalog
  // means Node is missing/old. A clean empty-dir scan returns an empty (non-null) catalog.
  const refreshAll = async () => {
    const scan = await plugin.reloadLocalToolHost();
    if (!scan.catalog) {
      listEl.empty();
      listEl.createEl('p', {
        text: scan.scanFailed
          ? t('settings.localToolHost.scanFailed')
          : t('settings.localToolHost.nodeUnsupported'),
        cls: 'setting-item-description mod-warning',
      });
      return;
    }
    renderList(scan.catalog);
  };

  new Setting(host).addButton((btn) =>
    btn.setButtonText(t('settings.localToolHost.reload')).onClick(refreshAll),
  );

  renderSecretAllowlist(host.createDiv({ cls: 'specorator-tool-host-secrets' }), plugin, settingsBag);

  void refreshAll();
};

/**
 * Editor for the fail-closed secret allowlist. Each row binds a tool-facing `name`
 * (what a tool declares in `manifest.secrets` / reads from `ctx.secrets`) to a
 * keychain `secretId` (Obsidian `SecretComponent`). A tool receives a secret ONLY
 * when its declared name appears here, so naming another credential's id grants
 * nothing — the keychain handle is user-chosen, never tool-controlled.
 */
function renderSecretAllowlist(
  host: HTMLElement,
  plugin: PluginContext,
  settingsBag: Record<string, unknown>,
): void {
  render();

  function currentRefs(): ToolHostSecretRef[] {
    return getClaudeProviderSettings(settingsBag).localToolHostSecrets;
  }

  async function persist(next: ToolHostSecretRef[]): Promise<void> {
    updateClaudeProviderSettings(settingsBag, { localToolHostSecrets: next });
    await plugin.saveSettings();
    render();
  }

  /** Clear a Specorator-owned value once no row references it (global ids are left alone). */
  function clearIfOrphaned(secretId: string, refs: ToolHostSecretRef[]): void {
    if (!isSpecoratorGeneratedSecretId(secretId)) return;
    if (refs.some((ref) => ref.secretId === secretId)) return;
    plugin.secretStore.clear(secretId);
  }

  function render(): void {
    host.empty();
    new Setting(host)
      .setName(t('settings.localToolHost.secretsHeading'))
      .setDesc(t('settings.localToolHost.secretsDesc'))
      .setHeading();

    for (const ref of currentRefs()) {
      const setting = new Setting(host).setName(ref.name);
      if (!isSecretSet(plugin, ref.secretId)) {
        setting.setDesc(t('settings.localToolHost.secretNotSet'));
      }
      setting.addComponent((el) =>
        new SecretComponent(plugin.app, el)
          .setValue(ref.secretId)
          .onChange((secretId) => {
            const previousId = ref.secretId;
            const next = currentRefs().map((r) => (r.name === ref.name ? { ...r, secretId } : r));
            void persist(next).then(() => clearIfOrphaned(previousId, next));
          }),
      );
      setting.addExtraButton((btn) =>
        btn.setIcon('trash').setTooltip(t('settings.localToolHost.secretRemove')).onClick(() => {
          const next = currentRefs().filter((r) => r.name !== ref.name);
          void persist(next).then(() => clearIfOrphaned(ref.secretId, next));
        }),
      );
    }

    const draft = { name: '', secretId: '' };
    new Setting(host)
      .setName(t('settings.localToolHost.secretAdd'))
      .addText((text) =>
        text
          .setPlaceholder(t('settings.localToolHost.secretNamePlaceholder'))
          .onChange((value) => { draft.name = value.trim(); }),
      )
      .addComponent((el) =>
        new SecretComponent(plugin.app, el).onChange((secretId) => { draft.secretId = secretId; }),
      )
      .addButton((btn) =>
        btn.setButtonText(t('settings.localToolHost.secretAddButton')).onClick(() => {
          if (!draft.name || !draft.secretId) return;
          // One entry per name: replacing keeps the allowlist a strict set (a stale row would
          // otherwise still grant once the newer one is removed). Clear the displaced id if orphaned.
          const replaced = currentRefs().find((r) => r.name === draft.name);
          const next = currentRefs().filter((r) => r.name !== draft.name);
          next.push({ name: draft.name, secretId: draft.secretId });
          void persist(next).then(() => {
            if (replaced) clearIfOrphaned(replaced.secretId, next);
          });
        }),
      );
  }
}

/** A ref is "set" only when SecretStorage holds a non-empty value on this device. */
function isSecretSet(plugin: PluginContext, secretId: string): boolean {
  const value = plugin.app.secretStorage?.getSecret(secretId);
  return value !== null && value !== undefined && value !== '';
}
