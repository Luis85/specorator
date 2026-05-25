import { App, Modal } from "obsidian";
import type { HookFragment } from "../catalog/hooks";
import type { FileSystem } from "../catalog/types";

export interface HookSummary {
  event: string;
  command: string;
  warning: string;
  syncWarning?: string;
}

// Pure-ish detector: probes for sync/VCS markers in the vault root.
// Returns a human-readable label of the detected sync mechanism, or null.
export async function detectSyncedVault(fs: FileSystem): Promise<string | null> {
  if ((await fs.exists(".git/config")) || (await fs.exists(".git/HEAD")))
    return "a Git repository";
  if (await fs.exists(".obsidian/sync.json")) return "Obsidian Sync";
  if (await fs.exists(".obsidian/sync")) return "Obsidian Sync";
  return null;
}

export async function buildHookSummary(
  fs: FileSystem,
  frag: HookFragment,
): Promise<HookSummary> {
  const sync = await detectSyncedVault(fs);
  const entry = frag.entry as Record<string, unknown>;
  return {
    event: frag.event,
    command: typeof entry["command"] === "string" ? entry["command"] : "",
    warning:
      "This command runs automatically on the event above with your full permissions.",
    syncWarning: sync
      ? `This vault appears to be under ${sync}. Enabling a hook writes an auto-running ` +
        `command into .claude/hooks/hooks.json, which will propagate to every machine/` +
        `collaborator that syncs this vault. Only continue if you trust that scope.`
      : undefined,
  };
}

export class HookConsentModal extends Modal {
  constructor(
    private fs: FileSystem,
    app: App,
    private frag: HookFragment,
    private onConfirm: () => void,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const s = await buildHookSummary(this.fs, this.frag);
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Enable hook?" });
    contentEl.createEl("p", { text: `Event: ${s.event}` });
    contentEl.createEl("pre", { text: s.command });
    contentEl.createEl("p", { text: s.warning, cls: "mod-warning" });
    if (s.syncWarning) {
      contentEl.createEl("p", { text: s.syncWarning, cls: "mod-warning" });
    }
    contentEl
      .createEl("button", { text: "Enable hook" })
      .addEventListener("click", () => {
        this.onConfirm();
        this.close();
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
