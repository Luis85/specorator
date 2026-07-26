import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

/**
 * A FRESH Pinia per Setup leaf — deliberately not a module singleton like the
 * Marketplace's. Wizard state (current step, in-flight install output) belongs
 * to one leaf's session; sharing it would make two open Setup leaves fight over
 * the same step pointer and interleave one install console into both.
 */
export function createOnboardingPinia(): Pinia {
  return createPinia();
}
