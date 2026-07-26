import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '@/main';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator-plugin');

/** Closes the leaf hosting this island (Finish / Close). Owned by `OnboardingView`. */
export const CLOSE_VIEW_KEY: InjectionKey<() => void> = Symbol('specorator-onboarding-close');
