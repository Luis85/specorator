import type { TabChromeSnapshot, TabChromeSubscribe } from '../ui/vue/tabChrome/tabChromeCallbacks';
import { ProjectionObserverSet } from './projectionObservers';
import type { TabData } from './types';

/**
 * Per-tab projection source for the Vue tab-chrome island. Mirrors
 * `TabComposerProjection`: the engine mutates its own state (ChatState.currentTodos,
 * BashOutputStore); this pushes a fully-projected {@link TabChromeSnapshot} to every
 * observer via the shared {@link ProjectionObserverSet}. Reads the tab lazily at
 * emit time.
 */
export class TabChromeProjection {
  private readonly observerSet = new ProjectionObserverSet<TabChromeSnapshot>();

  constructor(private readonly tab: TabData) {}

  readonly subscribe: TabChromeSubscribe = (onChange) => this.observerSet.subscribe(() => this.snapshot(), onChange);

  emit(): void {
    this.observerSet.emit(() => this.snapshot());
  }

  private snapshot(): TabChromeSnapshot {
    return {
      todos: this.tab.state.currentTodos,
      bashOutputs: this.tab.bashOutputs?.list() ?? [],
    };
  }
}
