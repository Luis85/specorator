import { type Ref,ref } from 'vue';

import type SpecoratorPlugin from '@/main';

import { type OnboardingScalarKey, readAppSetting, setAppSetting } from '../onboardingSettings';

/**
 * Two-way binding for one top-level setting: reads the live value once, writes
 * through `plugin.saveSettings()` on change. No watcher on `plugin.settings` —
 * it is a plain non-reactive object, and the wizard is a short-lived surface, so
 * a read-at-mount + write-on-change binding is the honest shape rather than one
 * that pretends to track external edits.
 *
 * Returns a TUPLE, not an object: a ref nested inside a returned object is not
 * unwrapped in templates (only top-level setup bindings are), so `binding.value`
 * would render the Ref itself.
 */
export function useAppSetting<T extends string | number | boolean>(
  plugin: SpecoratorPlugin,
  key: OnboardingScalarKey,
  fallback: T,
): [Ref<T>, (next: T) => Promise<void>] {
  const current = readAppSetting(plugin, key);
  const value = ref(
    (typeof current === typeof fallback ? current : fallback) as T,
  ) as Ref<T>;

  const set = async (next: T): Promise<void> => {
    value.value = next;
    await setAppSetting(plugin, key, next);
  };

  return [value, set];
}
