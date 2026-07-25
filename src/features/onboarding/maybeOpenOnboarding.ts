import type SpecoratorPlugin from '../../main';
import { hasAnyProviderEnabled } from '../settings/firstRunBanner/hasAnyProviderEnabled';
import { activateOnboarding } from './activateOnboarding';
import { isOnboardingComplete } from './onboardingSettings';

/**
 * Whether this load is a genuine first run in this vault.
 *
 * Two conditions, matching the settings banner exactly (both read
 * `firstRunDismissed` + provider-enabled state): the flow was never completed
 * or dismissed, AND no provider is enabled. The second is what keeps the view
 * from ambushing someone already productive — an existing user who enabled a
 * provider from the settings tab and never met the banner is set up, whatever
 * the flag says.
 */
export function shouldOpenOnboarding(plugin: SpecoratorPlugin): boolean {
  return !isOnboardingComplete(plugin) && !hasAnyProviderEnabled(plugin.settings);
}

/**
 * Opens the Setup view once on a first run. Called from the deferred (post
 * `onLayoutReady`) onload path so provider workspace services exist and CLI
 * detection reports what the runtime would really find — probing earlier would
 * show every provider as "unknown" on the one load that matters most.
 */
export async function maybeOpenOnboarding(plugin: SpecoratorPlugin): Promise<void> {
  if (!shouldOpenOnboarding(plugin)) return;
  await activateOnboarding(plugin);
}
