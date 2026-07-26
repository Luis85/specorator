import { asSettingsBag } from '@/core/types/settings';

import type SpecoratorPlugin from '../../main';
import { hasAnyProviderEnabled } from '../settings/firstRunBanner/hasAnyProviderEnabled';
import { activateOnboarding } from './activateOnboarding';
import { isOnboardingComplete } from './onboardingSettings';

/**
 * Whether this load should AUTO-open the Setup view.
 *
 * Three conditions:
 * - the view has never auto-opened in this vault (`onboardingAutoOpened`),
 * - the flow was not completed or dismissed (`firstRunDismissed`), and
 * - no provider is enabled — which keeps the view from ambushing someone
 *   already productive: an existing user who enabled a provider from the
 *   settings tab and never met the banner is set up, whatever the flags say.
 *
 * `onboardingAutoOpened` is deliberately separate from `firstRunDismissed`.
 * The auto-open must happen at most once **however the view is closed**, and
 * Obsidian's own tab-close control never reaches our code — so keying the
 * trigger on a dismissal the user may never explicitly perform would re-steal
 * focus on every subsequent load. Writing the flag in `ItemView.onClose`
 * instead would be worse: that hook also fires on plugin unload and on
 * popout/move, where "dismissed" is not the user's intent and a `saveSettings`
 * may not flush. `firstRunDismissed` keeps its own meaning — it gates the
 * settings banner, so someone who closed the wizard without configuring still
 * has a quiet nudge with a way back in.
 */
export function shouldOpenOnboarding(plugin: SpecoratorPlugin): boolean {
  return !asSettingsBag(plugin.settings).onboardingAutoOpened
    && !isOnboardingComplete(plugin)
    && !hasAnyProviderEnabled(plugin.settings);
}

/**
 * Auto-opens the Setup view once per vault. Called from the deferred (post
 * `onLayoutReady`) startup path so provider workspace services exist and CLI
 * detection reports what the runtime would really find — probing earlier would
 * show every provider as "unknown" on the one load that matters most.
 *
 * The flag is persisted BEFORE the leaf opens: if activation throws, the user
 * still gets the command + settings-banner route rather than a view that
 * re-ambushes them every load.
 */
export async function maybeOpenOnboarding(plugin: SpecoratorPlugin): Promise<void> {
  if (!shouldOpenOnboarding(plugin)) return;
  asSettingsBag(plugin.settings).onboardingAutoOpened = true;
  await plugin.saveSettings();
  await activateOnboarding(plugin);
}
