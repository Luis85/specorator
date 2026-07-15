import {
  type EnvHashReconcilerSpec,
  reconcileEnvironmentHash,
} from '../../../core/providers/EnvHashReconciler';
import type { ProviderSettingsReconciler } from '../../../core/providers/types';
import { parseEnvironmentVariables } from '../../../utils/env';
import { toCursorModelValue } from '../runtime/cursorModelId';
import { getCursorProviderSettings, updateCursorProviderSettings } from '../settings';
import { getCursorState } from '../types';

// CURSOR_SESSION_TOKEN is part of the active account/backend identity (it also
// keys the model-catalog cache), so a token-only change must reconcile: reset the
// session and invalidate saved Cursor session ids rather than let the new
// credential load the prior credential's native session artifacts.
const ENV_HASH_KEYS = ['CURSOR_API_KEY', 'CURSOR_SESSION_TOKEN', 'CURSOR_BASE_URL'];

const cursorEnvHashSpec: EnvHashReconcilerSpec = {
  providerId: 'cursor',
  watchedKeys: ENV_HASH_KEYS,
  getSavedHash: settings => getCursorProviderSettings(settings).environmentHash,
  saveHash: (settings, hash) => updateCursorProviderSettings(settings, { environmentHash: hash }),
  invalidateConversation: conversation => {
    const state = getCursorState(conversation.providerState);
    if (conversation.providerId !== 'cursor' || !(conversation.sessionId || state.chatSessionId)) {
      return false;
    }
    conversation.sessionId = null;
    conversation.providerState = undefined;
    return true;
  },
  reconcileModel: (settings, envText) => {
    const envVars = parseEnvironmentVariables(envText || '');
    if (envVars.CURSOR_MODEL) {
      settings.model = toCursorModelValue(envVars.CURSOR_MODEL);
    }
  },
};

export const cursorSettingsReconciler: ProviderSettingsReconciler = {
  reconcileModelWithEnvironment: (settings, conversations, resolveEnvText) =>
    reconcileEnvironmentHash(cursorEnvHashSpec, settings, conversations, resolveEnvText),

  setEnabled(settings, enabled) {
    updateCursorProviderSettings(settings, { enabled });
  },

  normalizeModelVariantSettings(_settings): boolean {
    // ACP must see explicit variants unchanged so unsupported selections fail
    // rather than being silently collapsed to the family.
    return false;
  },
};
