import type { TranslationKey } from '@/i18n/types';

/**
 * The setup flow's step order. Providers come first because every later step is
 * shaped by which providers are on; Finish is last and always reachable — the
 * rail is free-navigable, so no step can trap the user.
 */
export const ONBOARDING_STEPS = [
  'providers',
  'defaults',
  'folders',
  'workspace',
  'marketplace',
  'finish',
] as const;

export type OnboardingStep = typeof ONBOARDING_STEPS[number];

const STEP_LABEL_KEYS: Record<OnboardingStep, TranslationKey> = {
  providers: 'onboarding.step.providers',
  defaults: 'onboarding.step.defaults',
  folders: 'onboarding.step.folders',
  workspace: 'onboarding.step.workspace',
  marketplace: 'onboarding.step.marketplace',
  finish: 'onboarding.step.finish',
};

export function onboardingStepLabelKey(step: OnboardingStep): TranslationKey {
  return STEP_LABEL_KEYS[step];
}
