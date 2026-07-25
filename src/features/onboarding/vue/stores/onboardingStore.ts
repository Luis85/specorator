import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type { ProviderCliInstallMethod, ProviderId } from '@/core/providers/types';
import { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import { asSettingsBag } from '@/core/types';
import type SpecoratorPlugin from '@/main';
import { getHostnameKey } from '@/utils/env';

import {
  appendInstallOutput,
  type CliInstallHandle,
  runCliInstall,
} from '../../cliInstallRunner';
import {
  completeOnboarding,
  ensureOnboardingFolders,
  type OnboardingFolderKey,
  type OnboardingFolderState,
  readOnboardingFolders,
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

  function requirePlugin(): SpecoratorPlugin {
    if (!plugin) throw new Error('Onboarding store used before init()');
    return plugin;
  }

  function init(next: SpecoratorPlugin): void {
    plugin = next;
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
    await setProviderEnabled(requirePlugin(), providerId, enabled);
    refreshDetections();
  }

  async function setCliPath(providerId: ProviderId, cliPath: string): Promise<void> {
    await setProviderCliPathForHost(requirePlugin(), providerId, getHostnameKey(), cliPath);
    refreshDetections();
  }

  /**
   * Spawns a provider-declared install method and streams its output. Re-probes
   * on completion so a successful install flips the card to "detected" without
   * the user having to press anything.
   */
  function startInstall(providerId: ProviderId, method: ProviderCliInstallMethod): void {
    if (runFor(providerId).phase === 'running') return;

    patchRun(providerId, { phase: 'running', methodId: method.id, lines: [], error: null });
    const handle = runCliInstall(method, {
      onOutput: (text) => {
        patchRun(providerId, { lines: appendInstallOutput(runFor(providerId).lines, text) });
      },
    });
    handles.set(providerId, handle);

    void handle.done.then((result) => {
      handles.delete(providerId);
      if (result.cancelled) {
        patchRun(providerId, { phase: 'cancelled' });
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

  /** Model options contributed by the enabled providers, deduped by value. */
  const modelOptions = computed(() => {
    if (!plugin) return [];
    const settings = asSettingsBag(plugin.settings);
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string; group?: string }> = [];
    for (const providerId of enabledProviderIds.value) {
      const displayName = ProviderRegistry.getProviderDisplayName(providerId);
      for (const option of ProviderRegistry.getChatUIConfig(providerId).getModelOptions(settings)) {
        if (seen.has(option.value)) continue;
        seen.add(option.value);
        options.push({ value: option.value, label: option.label, group: displayName });
      }
    }
    return options;
  });

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
    modelOptions,
    init,
    runFor,
    refreshDetections,
    setEnabled,
    setCliPath,
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
