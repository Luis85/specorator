import {
  type App,
  type Plugin,
  Platform as ObsidianPlatform,
  PluginSettingTab,
  Setting,
  Notice,
} from "obsidian";
import type { CatalogIndex, AssetMeta, FileSystem } from "../catalog/types";
import type { Platform } from "../catalog/types";
import { enableAsset, disableAsset } from "../catalog/installer";
import type { ConflictChoice } from "../catalog/installer";
import { loadState } from "../catalog/sidecar";
import { scanForInjection } from "../catalog/scanner";
import { targetPath, supportedPlatforms } from "../catalog/platforms";
import { buildConsentSummary, ConsentModal } from "./ConsentModal";
import { ConflictModal } from "./ConflictModal";
import { partitionTools } from "../catalog/policy";

/** B7: default platform selection so multi-platform emit is reachable immediately. */
export const DEFAULT_PLATFORMS: Platform[] = ["claude"];
export const ALL_PLATFORMS: Platform[] = ["claude", "cursor", "codex", "gemini"];

export interface BadgeState {
  installed: boolean;
  requiresOk: boolean;
  denied?: boolean;         // a required tool is present but in `deny` mode (v0.1.0)
  conflict?: boolean;       // untracked file occupies a target path
  installedHash?: string;   // hash recorded at install time
  catalogHash?: string;     // hash of the current catalog body
}

export function computeBadge(s: BadgeState): string {
  if (s.installed) {
    if (s.installedHash && s.catalogHash && s.installedHash !== s.catalogHash)
      return "Update available";
    return "Enabled";
  }
  if (s.conflict) return "Conflict";
  if (s.denied) return "Needs tool (denied)";  // required tool present but deny-moded
  if (!s.requiresOk) return "Needs tool";
  return "Available";
}

// Plugin settings interface — plugin must expose this shape
interface PluginWithSettings extends Plugin {
  settings: {
    platforms?: Platform[];
    [key: string]: unknown;
  };
  saveSettings(): Promise<void>;
}

export class CatalogSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private fs: FileSystem,
    private catalog: CatalogIndex,
  ) { super(app, plugin); }

  display(): void {
    void this.renderDisplay();
  }

  private get pluginWithSettings(): PluginWithSettings {
    return this.plugin as PluginWithSettings;
  }

  private platforms(): Platform[] {
    const p = this.pluginWithSettings.settings.platforms;
    return (p && p.length > 0) ? p : DEFAULT_PLATFORMS;
  }

  private onConflict(path: string): Promise<ConflictChoice> {
    return new Promise<ConflictChoice>((resolve) =>
      new ConflictModal(this.app, path, resolve).open()
    );
  }

  private async renderDisplay(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Workflow catalog").setHeading();

    // Desktop-only guard (Medium): installer writes outside-vault config dirs
    if (!ObsidianPlatform.isDesktopApp) {
      containerEl.createEl("p", {
        text: "The Workflow Catalog installer is desktop-only — it writes agent " +
              "config files (.claude/, .cursor/, .gemini/, .agents/) into your vault folder.",
      });
      return;
    }

    // B7: platform-selection multi-select
    const selected = new Set<Platform>(this.platforms());
    const psetting = new Setting(containerEl)
      .setName("Target platforms")
      .setDesc("Which agent platforms to install assets for.");
    for (const p of ALL_PLATFORMS) {
      psetting.addToggle((t) =>
        t.setTooltip(p).setValue(selected.has(p)).onChange(async (on) => {
          if (on) selected.add(p); else selected.delete(p);
          this.pluginWithSettings.settings.platforms = [...selected];
          await this.pluginWithSettings.saveSettings();
        }),
      );
    }

    // Search filter (Medium)
    let searchFilter = "";
    new Setting(containerEl).addSearch((s) =>
      s.setPlaceholder("Search assets...").onChange((v) => {
        searchFilter = v.toLowerCase();
        void this.renderDisplay();
      })
    );

    const state = await loadState(this.fs);

    const bundles = new Map<string, AssetMeta[]>();
    for (const a of this.catalog.assets) {
      if (!bundles.has(a.bundle)) bundles.set(a.bundle, []);
      bundles.get(a.bundle)!.push(a);
    }

    const currentPlatforms = this.platforms();

    for (const [bundle, assets] of bundles) {
      const filtered = assets.filter(
        (a) => !searchFilter ||
          a.name.toLowerCase().includes(searchFilter) ||
          a.description.toLowerCase().includes(searchFilter),
      );
      if (filtered.length === 0) continue;

      // Bundle heading + "Enable all" button (Medium)
      const header = new Setting(containerEl).setName(bundle).setHeading();
      header.addButton((b) =>
        b.setButtonText("Enable all").onClick(async () => {
          const notInstalled = filtered.filter((a) => !state[a.id]);
          const destructiveTools = notInstalled.flatMap(
            (a) => partitionTools(a.requires).destructive,
          );
          const allPaths = notInstalled.flatMap((a) =>
            currentPlatforms
              .filter((p) => supportedPlatforms(a).includes(p))
              .flatMap((p) => {
                try { return [targetPath(a, p)]; } catch { return []; }
              })
          );
          const summary = buildConsentSummary(
            notInstalled[0] ?? assets[0],
            allPaths,
            notInstalled.some((a) => scanForInjection(a.body).flagged),
          );
          // Surface destructive tools in the summary body
          if (destructiveTools.length > 0) {
            summary.body = `⚠ Destructive tools: ${destructiveTools.join(", ")}\n\n${summary.body}`;
          }
          new ConsentModal(this.app, summary, () => {
            void (async () => {
              for (const a of notInstalled) {
                await enableAsset(this.fs, a, this.catalog.assets, currentPlatforms, {
                  onConflict: (p) => this.onConflict(p),
                  onUserModified: (p) => this.onConflict(p),
                });
              }
              new Notice(`Enabled ${notInstalled.length} asset(s) in ${bundle}`);
              this.display();
            })();
          }).open();
        })
      );

      for (const asset of filtered) {
        const installed = Object.hasOwn(state, asset.id);

        // Compute badge state for this asset
        const requiresOk = asset.requires.length === 0; // simplified — full check in v1 requires live tools
        const { destructive: destructiveReqs } = partitionTools(asset.requires);
        const badgeState: BadgeState = {
          installed,
          requiresOk: requiresOk || destructiveReqs.length < asset.requires.length,
          installedHash: state[asset.id]?.hash,
          // catalogHash would come from sha256(asset.body) — simplified here
        };

        const badgeText = computeBadge(badgeState);

        new Setting(containerEl)
          .setName(asset.name)
          .setDesc(asset.description)
          .addToggle((t) =>
            t.setValue(installed).onChange((value) => {
              void this.handleToggle(asset, value);
            })
          )
          .then((s) => {
            s.nameEl.createSpan({ text: ` [${badgeText}]`, cls: "catalog-badge" });
          });
      }
    }
  }

  private async handleToggle(asset: AssetMeta, value: boolean): Promise<void> {
    try {
      if (value) {
        const scan = scanForInjection(asset.body);
        const currentPlatforms = this.platforms();
        const paths = currentPlatforms
          .filter((p) => supportedPlatforms(asset).includes(p))
          .flatMap((p) => {
            try { return [targetPath(asset, p)]; } catch { return []; }
          });
        const summary = buildConsentSummary(asset, paths, scan.flagged);
        new ConsentModal(this.app, summary, () => {
          void enableAsset(this.fs, asset, this.catalog.assets, currentPlatforms, {
            onConflict: (p) => this.onConflict(p),
            onUserModified: (p) => this.onConflict(p),
          })
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
