// Jest-lane stand-in for `pinia`. Pinia is ESM-only since v4 (no CommonJS
// build), which the CommonJS ts-jest lane cannot `require`. Pinia is the state
// layer of the Vue islands — a surface the Jest lane already stubs (`.vue`
// components, `mountTranscript`); the Vitest lane owns all real store behavior
// (vitest.config.mts coverage-gates `src/**/ui/vue/**`).
//
// In the Jest lane, stores are DEFINED at import time (`defineStore(...)`) but
// never INVOKED: `mountTabChromeApp` / `mountComposer` / the Agent Board mount
// build the app around a stubbed `.vue` root that renders nothing, so no
// `useXxxStore()` is ever reached. This shim therefore only has to satisfy
// module eval — `createPinia()` (handed to `app.use`) plus `defineStore`
// registration — but it still implements a faithful setup-store singleton over
// real Vue reactivity, so any future jest-reachable `useStore()` call keeps
// working instead of silently returning a broken object.

import { effectScope } from 'vue';

type SetupStore = () => Record<string, unknown>;

export interface Pinia {
  install: (app?: unknown) => void;
  _s: Map<string, Record<string, unknown>>;
}

let activePinia: Pinia | undefined;

export function createPinia(): Pinia {
  const pinia: Pinia = {
    _s: new Map(),
    install() {
      activePinia = pinia;
    },
  };
  return pinia;
}

export function setActivePinia(pinia: Pinia | undefined): void {
  activePinia = pinia;
}

export function getActivePinia(): Pinia | undefined {
  return activePinia;
}

// All Specorator stores use the setup syntax `defineStore('id', () => {...})`.
export function defineStore(id: string, setup: SetupStore): () => Record<string, unknown> {
  return () => {
    const pinia = activePinia ?? createPinia();
    const cached = pinia._s.get(id);
    if (cached) return cached;
    const scope = effectScope(true);
    const store = scope.run(() => setup()) ?? {};
    pinia._s.set(id, store);
    return store;
  };
}

export function storeToRefs<T extends Record<string, unknown>>(store: T): T {
  return store;
}
