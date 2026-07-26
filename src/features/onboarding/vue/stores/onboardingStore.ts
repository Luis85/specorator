import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type { ProviderCliInstallMethod, ProviderId } from '@/core/providers/types';
import { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import { asSettingsBag } from '@/core/types';
import type SpecoratorPlugin from '@/main';
import { broadcastCliPathRuntimeCleanup } from '@/shared/settings/cliPathSetting';
import { getHostnameKey } from '@/utils/env';

import {
  appendInstallOutput,
  type CliInstallHandle,
  runCliInstall,
} from '../../cliInstallRunner';
import { acquireInstallLock, installingProvider, releaseInstallLock } from '../../installLock';
import {
  completeOnboarding,
  ensureOnboardingFolders,
  type OnboardingFolderKey,
  type OnboardingFolderState,
  readOnboardingFolders,
  setDefaultModel,
  setFolderSetting,
  setProviderCliPathForHost,
  setProviderEnabled,
} from '../../onboardingSettings';
import { ONBOARDING_STEPS, type OnboardingStep } from '../../onboardingSteps';
import { detectProviderClis, type ProviderCliDetection } from '../../providerDetection';

export type InstallPhase = 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface InstallRunState {
  phase: InstallPhase;
  methodId: string | null;
  lines: string[];
  error: string | null;
}

const IDLE_RUN: InstallRunState = { phase: 'idle', methodId: null, lines: [], error: null };

/** One selectable model, tagged with the provider that owns it. */
export interface OnboardingModelOption {
  providerId: ProviderId;
  value: string;
  label: string;
  group: string;
}

/**
 * Setup-view store: a reactive projection over provider CLI detection, the
 * install runner, and the settings writers. Truth stays where it already lives
 * — `plugin.settings` (persisted on every touch) and the provider registries —
 * so the wizard can be abandoned at any point without losing or half-applying
 * anything.
 */
export const useOnboardingStore = defineStore('specorator-onboarding', () => {
  let plugin: SpecoratorPlugin | null = null;
  const handles = new Map<ProviderId, CliInstallHandle>();

  const step = ref<OnboardingStep>('providers');
  const detections = shallowRef<ProviderCliDetection[]>([]);
  const scanning = ref(false);
  const folders = shallowRef<OnboardingFolderState[]>([]);
  const creatingFolders = ref(false);
  const folderError = ref<string | null>(null);
  /** Per-provider install run state, replaced wholesale so watchers fire. */
  const runs = ref<Record<string, InstallRunState>>({});
  /**
   * The provider a blank chat currently prefers; disambiguates a shared model id.
   *
   * Reactive STATE mirrored from settings, deliberately not a computed reading
   * `plugin.settings`: that bag is a plain object, so a computed over it
   * registers no dependency and caches its first answer for the life of the
   * store. Both the provider toggle and the model pick move `settingsProvider`,
   * and a stale owner made the model selector resolve a shared id against the
   * previous provider — the pick appeared to snap back to the old owner.
   */
  const settingsProviderId = ref('');

  function requirePlugin(): SpecoratorPlugin {
    if (!plugin) throw new Error('Onboarding store used before init()');
    return plugin;
  }

  function syncSettingsProviderId(): void {
    const current = plugin ? asSettingsBag(plugin.settings).settingsProvider : '';
    settingsProviderId.value = typeof current === 'string' ? current : '';
  }

  function init(next: SpecoratorPlugin): void {
    plugin = next;
    syncSettingsProviderId();
    if (detections.value.length === 0) refreshDetections();
    if (folders.value.length === 0) void refreshFolders();
  }

  function runFor(providerId: ProviderId): InstallRunState {
    return runs.value[providerId] ?? IDLE_RUN;
  }

  function patchRun(providerId: ProviderId, patch: Partial<InstallRunState>): void {
    runs.value = {
      ...runs.value,
      [providerId]: { ...runFor(providerId), ...patch },
    };
  }

  /**
   * The one provider currently installing anywhere — installs do not overlap.
   *
   * Three of the four providers install through a global `npm install -g`, which
   * mutates one shared prefix and one shared metadata tree. Two package managers
   * doing that at once is not two independent installs: they contend, and one can
   * fail or clobber the other's result.
   *
   * Read from the module-scope lock rather than this store's own runs, because
   * Setup mounts one Pinia PER LEAF: a lock derived from `runs` would serialize
   * within a leaf and not across two of them. See `installLock`.
   */
  const installingProviderId = computed<ProviderId | null>(() => installingProvider.value);

  /** Synchronous: every probe is a `statSync` walk of PATH, never a subprocess. */
  function refreshDetections(): void {
    scanning.value = true;
    try {
      detections.value = detectProviderClis(requirePlugin());
    } finally {
      scanning.value = false;
    }
  }

  async function setEnabled(providerId: ProviderId, enabled: boolean): Promise<void> {
    const active = requirePlugin();
    await setProviderEnabled(active, providerId, enabled);
    // Same post-save refresh as the canonical toggle in
    // `settings/ui/GeneralTabSections.ts`: a chat leaf that was already open
    // mounted the no-provider placeholder, and Finish REVEALS that leaf rather
    // than building a new one — without this it would sit there unusable until
    // the user reloaded the plugin.
    for (const view of active.getAllViews()) {
      view.refreshModelSelector();
      void view.refreshProviderAvailability();
    }
    // The toggle re-projects the selection, so the preferred provider moved.
    syncSettingsProviderId();
    refreshDetections();
  }

  async function setCliPath(providerId: ProviderId, cliPath: string): Promise<void> {
    const active = requirePlugin();
    await setProviderCliPathForHost(active, providerId, getHostnameKey(), cliPath);
    // Same runtime recycle the provider CLI-path widgets perform: a persistent
    // Codex/Cursor/OpenCode process already holds the OLD executable, so
    // without this the card would read "detected" while live chats kept
    // spawning the previous binary. refreshDetections() resets the resolver;
    // this restarts the runtimes that resolved through it.
    //
    // Residual: OpenCode's widget additionally clears its discovery state
    // (model/mode catalog) via a provider-internal helper the features layer
    // cannot reach — so an OpenCode path change made here can leave a stale
    // model list until its next discovery. Closing that needs a
    // registration-level "CLI path changed" hook, not a provider import.
    await broadcastCliPathRuntimeCleanup(active);
    refreshDetections();
  }

  /**
   * Spawns a provider-declared install method and streams its output. Re-probes
   * on completion so a successful install flips the card to "detected" without
   * the user having to press anything.
   */
  function startInstall(providerId: ProviderId, method: ProviderCliInstallMethod): void {
    // Process-wide, not per-provider and not per leaf: see `installLock`.
    if (!acquireInstallLock(providerId)) return;

    patchRun(providerId, { phase: 'running', methodId: method.id, lines: [], error: null });
    const handle = runCliInstall(method, {
      onOutput: (text) => {
        patchRun(providerId, { lines: appendInstallOutput(runFor(providerId).lines, text) });
      },
    });
    handles.set(providerId, handle);

    void handle.done.then((result) => {
      handles.delete(providerId);
      releaseInstallLock(providerId);
      if (result.cancelled) {
        // A cancel can still carry a warning — an abort whose process tree was
        // never observed to exit. Dropping it would re-arm Install with nothing
        // said about what may still be running.
        patchRun(providerId, { phase: 'cancelled', error: result.error ?? null });
      } else if (result.ok) {
        patchRun(providerId, { phase: 'succeeded', error: null });
      } else {
        patchRun(providerId, {
          phase: 'failed',
          error: result.error ?? `Exit code ${result.exitCode ?? '?'}`,
        });
      }
      // The install changed no setting, so the provider's cached resolver would
      // still answer "missing" — refreshDetections resets it first.
      if (plugin) refreshDetections();
    });
  }

  function cancelInstall(providerId: ProviderId): void {
    handles.get(providerId)?.cancel();
  }

  async function refreshFolders(): Promise<void> {
    const active = requirePlugin();
    folders.value = await readOnboardingFolders(active, new VaultFileAdapter(active.app));
  }

  async function setFolder(key: OnboardingFolderKey, value: string): Promise<void> {
    await setFolderSetting(requirePlugin(), key, value);
    await refreshFolders();
  }

  async function createFolders(): Promise<void> {
    const active = requirePlugin();
    creatingFolders.value = true;
    folderError.value = null;
    try {
      folders.value = await ensureOnboardingFolders(active, new VaultFileAdapter(active.app));
    } catch (error) {
      folderError.value = error instanceof Error ? error.message : String(error);
    } finally {
      creatingFolders.value = false;
    }
  }

  const enabledProviderIds = computed<ProviderId[]>(() => (
    detections.value.filter((detection) => detection.enabled).map((d) => d.providerId)
  ));

  /**
   * Model options from every enabled provider, each carrying its OWNING
   * provider.
   *
   * Deliberately NOT deduped by model id: two providers can advertise the same
   * custom id, and collapsing them would show one entry under the wrong
   * provider while `setDefaultModel` re-inferred ownership from the id alone
   * (`resolveProviderForModel` prefers a non-current owner, so it could commit
   * the pick to the other provider). Carrying `providerId` through the
   * selection removes the inference entirely.
   */
  const modelOptions = computed<OnboardingModelOption[]>(() => {
    if (!plugin) return [];
    const settings = asSettingsBag(plugin.settings);
    const options: OnboardingModelOption[] = [];
    for (const providerId of enabledProviderIds.value) {
      const displayName = ProviderRegistry.getProviderDisplayName(providerId);
      for (const option of ProviderRegistry.getChatUIConfig(providerId).getModelOptions(settings)) {
        options.push({
          providerId,
          value: option.value,
          label: option.label,
          group: displayName,
        });
      }
    }
    return options;
  });

  /**
   * Commits a model pick to the provider that OWNS it — taken from the selected
   * option, never re-inferred from the model id. Lives here rather than in the
   * step so the owner re-read below can't be forgotten at a call site; it was
   * the one settings write the component made directly, which is exactly how
   * `settingsProviderId` went stale.
   */
  async function selectModel(option: OnboardingModelOption): Promise<void> {
    await setDefaultModel(requirePlugin(), option.value, option.providerId);
    syncSettingsProviderId();
  }

  function goTo(next: OnboardingStep): void {
    step.value = next;
  }

  function advance(delta: number): void {
    const index = ONBOARDING_STEPS.indexOf(step.value);
    const nextIndex = Math.min(Math.max(index + delta, 0), ONBOARDING_STEPS.length - 1);
    step.value = ONBOARDING_STEPS[nextIndex];
  }

  async function finish(): Promise<void> {
    await completeOnboarding(requirePlugin());
  }

  /** Cancels any in-flight install so a closed leaf leaves no orphan child. */
  function dispose(): void {
    for (const handle of handles.values()) handle.cancel();
    handles.clear();
  }

  return {
    step,
    detections,
    scanning,
    folders,
    creatingFolders,
    folderError,
    enabledProviderIds,
    installingProviderId,
    modelOptions,
    settingsProviderId,
    init,
    runFor,
    refreshDetections,
    setEnabled,
    setCliPath,
    selectModel,
    startInstall,
    cancelInstall,
    setFolder,
    createFolders,
    goTo,
    advance,
    finish,
    dispose,
  };
});
