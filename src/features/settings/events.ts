export interface SettingsEventMap {
  /** Emitted when a hotkey binding changes for a command. */
  'hotkey-changed': string; // commandId
  /**
   * Emitted after any settings change is persisted (`plugin.saveSettings`).
   * `plugin.settings` is a plain, non-reactive object, so views that snapshot a
   * setting (e.g. the Marketplace opt-in gate, or install-folder-derived state)
   * subscribe to this to re-read live instead of waiting for a remount — Obsidian
   * Settings is a modal over the active leaf, so `active-leaf-change` can't be
   * relied on to fire when a setting is toggled and the modal dismissed.
   */
  'settings-changed': void;
}
