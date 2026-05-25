import {
  type App,
  type Plugin,
  Platform as ObsidianPlatform,
  PluginSettingTab,
  Setting,
  Notice,
} from "obsidian";
import type { CatalogIndex, AssetMeta, FileSystem, InstalledState } from "../catalog/types";
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
    if (
      s.installedHash !== undefined && s.catalogHash !== undefined &&
      s.installedHash !== s.catalogHash
    ) return "Update available";
    return "Enabled";
  }
  if (s.conflict === true) return "Conflict";
  if (s.denied === true) return "Needs tool (denied)";
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
  private readonly pw: PluginWithSettings;

  constructor(
    app: App,
    plugin: Plugin,
    private fs: FileSystem,
    private catalog: CatalogIndex,
  ) {
    super(app, plugin);
    this.pw = plugin as PluginWithSettings;
  }

  display(): void {
    void this.renderDisplay();
  }

  private platforms(): Platform[] {
    const p = this.pw.settings.platforms;
    return (p !== undefined && p.length > 0) ? p : DEFAULT_PLATFORMS;
  }

  private onConflict(path: string): Promise<ConflictChoice> {
    return new Promise<ConflictChoice>((resolve) => {
      new ConflictModal(this.app, path, resolve).open();
    });
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
          this.pw.settings.platforms = [...selected];
          await this.pw.saveSettings();
        }),
      );
    }

    // Search filter (Medium)
    let searchFilter = "";
    new Setting(containerEl).addSearch((s) => {
      s.setPlaceholder("Search assets...").onChange((v) => {
        searchFilter = v.toLowerCase();
        void this.renderDisplay();
      });
    });

    const state = await loadState(this.fs);
    const currentPlatforms = this.platforms();

    const bundles = new Map<string, AssetMeta[]>();
    for (const a of this.catalog.assets) {
      if (!bundles.has(a.bundle)) bundles.set(a.bundle, []);
      bundles.get(a.bundle)!.push(a);
    }

    for (const [bundle, assets] of bundles) {
      const filtered = assets.filter(
        (a) => searchFilter === "" ||
          a.name.toLowerCase().includes(searchFilter) ||
          a.description.toLowerCase().includes(searchFilter),
      );
      if (filtered.length === 0) continue;

      // Bundle heading + "Enable all" button (Medium)
      const header = new Setting(containerEl).setName(bundle).setHeading();
      header.addButton((b) => {
        b.setButtonText("Enable all").onClick(() => {
          this.handleEnableAll(bundle, filtered, assets, state, currentPlatforms);
        });
      });

      for (const asset of filtered) {
        const installed = Object.hasOwn(state, asset.id);
        const { destructive: destructiveReqs } = partitionTools(asset.requires);
        const badgeState: BadgeState = {
          installed,
          requiresOk: destructiveReqs.length < asset.requires.length || asset.requires.length === 0,
          installedHash: installed ? state[asset.id].hash : undefined,
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

  private handleEnableAll(
    bundle: string,
    filtered: AssetMeta[],
    assets: AssetMeta[],
    state: InstalledState,
    currentPlatforms: Platform[],
  ): void {
    const notInstalled = filtered.filter((a) => !Object.hasOwn(state, a.id));
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
    // assets is always non-empty (populated from bundles map); notInstalled[0] falls back to it.
    const firstAsset = notInstalled[0] ?? assets[0];
    const summary = buildConsentSummary(
      firstAsset,
      allPaths,
      notInstalled.some((a) => scanForInjection(a.body).flagged),
    );
    if (destructiveTools.length > 0) {
      summary.body = `Destructive tools: ${destructiveTools.join(", ")}\n\n${summary.body}`;
    }
    new ConsentModal(this.app, summary, () => {
      void (async () => {
        try {
          for (const a of notInstalled) {
            await enableAsset(this.fs, a, this.catalog.assets, currentPlatforms, {
              onConflict: (p) => this.onConflict(p),
              onUserModified: (p) => this.onConflict(p),
            });
          }
          new Notice(`Enabled ${notInstalled.length} asset(s) in ${bundle}`);
        } catch (e) {
          new Notice(`Failed: ${(e as Error).message}`);
        }
        this.display();
      })();
    }).open();
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
            })
            .catch((e: unknown) => {
              new Notice(`Failed: ${(e as Error).message}`);
            })
            .finally(() => {
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
