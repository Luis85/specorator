import { type App as VueApp, type Component, createApp } from 'vue';

/**
 * Lifecycle wrapper for a Vue island mounted into an arbitrary Obsidian-owned
 * `HTMLElement`. Consolidates the create/provide/mount + unmount boilerplate so
 * each consumer only declares its own inject provides.
 *
 * Consumers: the Agent Board modals mount their Vue internals through this in
 * `onOpen` and tear them down in `onClose`; the Agent Board lane editor mounts
 * into its Settings host and unmounts when that host detaches. The helper is
 * element-generic — it neither knows nor cares whether the mount target is a
 * modal `contentEl` or a settings container.
 */
export class VueIsland {
  private app: VueApp | null = null;

  mount(root: Component, el: HTMLElement, provide: (app: VueApp) => void): void {
    const app = createApp(root);
    provide(app);
    app.mount(el);
    this.app = app;
  }

  unmount(): void {
    this.app?.unmount();
    this.app = null;
  }
}
