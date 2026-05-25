import { type App, type Plugin, PluginSettingTab, Setting, Notice } from "obsidian";
import type { CatalogIndex, AssetMeta, FileSystem } from "../catalog/types";
import { enableAsset, disableAsset } from "../catalog/installer";
import { loadState } from "../catalog/sidecar";
import { scanForInjection } from "../catalog/scanner";
import { targetPath } from "../catalog/platforms";
import { buildConsentSummary, ConsentModal } from "./ConsentModal";

export class CatalogSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private fs: FileSystem,
    private catalog: CatalogIndex
  ) { super(app, plugin); }

  display(): void {
    void this.renderDisplay();
  }

  private async renderDisplay(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Workflow catalog").setHeading();
    const state = await loadState(this.fs);

    const bundles = new Map<string, AssetMeta[]>();
    for (const a of this.catalog.assets) {
      if (!bundles.has(a.bundle)) bundles.set(a.bundle, []);
      bundles.get(a.bundle)!.push(a);
    }

    for (const [bundle, assets] of bundles) {
      new Setting(containerEl).setName(bundle).setHeading();
      for (const asset of assets) {
        const installed = Object.hasOwn(state, asset.id);
        new Setting(containerEl)
          .setName(asset.name)
          .setDesc(asset.description)
          .addToggle((t) =>
            t.setValue(installed).onChange((value) => {
              void this.handleToggle(asset, value);
            })
          );
      }
    }
  }

  private async handleToggle(asset: AssetMeta, value: boolean): Promise<void> {
    try {
      if (value) {
        const scan = scanForInjection(asset.body);
        const summary = buildConsentSummary(
          asset, [targetPath(asset, "claude")], scan.flagged
        );
        new ConsentModal(this.app, summary, () => {
          void enableAsset(this.fs, asset, this.catalog.assets, ["claude"])
            .then(() => {
              new Notice(`Installed ${asset.name}`);
              this.display();
            });
        }).open();
      } else {
        await disableAsset(this.fs, asset.id);
        new Notice(`Removed ${asset.name}`);
        this.display();
      }
    } catch (e) {
      new Notice(`Failed: ${(e as Error).message}`);
      this.display();
    }
  }
}
