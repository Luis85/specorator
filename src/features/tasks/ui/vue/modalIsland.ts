import { type App as VueApp, type Component, createApp } from 'vue';

/**
 * Lifecycle wrapper for a Vue island mounted inside an Obsidian `Modal` shell.
 * The Agent Board modals keep their imperative shell (ctor + `.open()`) and mount
 * their Vue internals through this in `onOpen`, tearing them down in `onClose`.
 * Consolidates the create/provide/mount + unmount boilerplate so each modal only
 * declares its own inject provides.
 */
export class ModalIsland {
  private app: VueApp | null = null;

  mount(root: Component, contentEl: HTMLElement, provide: (app: VueApp) => void): void {
    const app = createApp(root);
    provide(app);
    app.mount(contentEl);
    this.app = app;
  }

  unmount(): void {
    this.app?.unmount();
    this.app = null;
  }
}
