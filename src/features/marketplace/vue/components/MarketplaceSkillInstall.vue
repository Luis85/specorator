<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { t } from '../../../../i18n/i18n';
import {
  DEFAULT_SKILL_TARGET,
  SKILL_INSTALL_SCOPES,
  type SkillInstallScope,
  type SkillInstallTarget,
  type SkillProviderTarget,
} from '../../skillInstallTargets';

/**
 * Skill install-target panel extracted from `MarketplaceDetail.vue`: the
 * provider + scope selectors, the per-target install button, and the
 * currently-selected-target installed recheck. It owns the whole
 * `SkillInstallTarget` concern (see the marketplace skills contract) for the two
 * cases that need a skill root — a skill itself, and a **package** whose
 * dependencies include skills (an agent that brings them). Both drive the button
 * from the SAME per-target check: `skillInstalledChecker` answers "is everything
 * this would write already here?" for the selected target, so a package installed
 * into one provider can still be installed into another.
 * Emits `install` with the chosen target; the detail re-emits it.
 */
const props = defineProps<{
  /** Provider targets to offer, labeled from the registry; `userScope` gates
   *  whether User scope resolves for that provider under the live settings. */
  skillProviderOptions?: { id: SkillProviderTarget; label: string; userScope?: boolean }[];
  /** Resolves whether the skill already exists at a given target. */
  skillInstalledChecker?: (target: SkillInstallTarget) => Promise<boolean>;
  installing: boolean;
  body: string | null;
  /** The catalog item id; the installed recheck reruns when it changes. */
  itemId: string;
  /** Identity changes when the store recomputes installed state, rerunning the
   *  per-target check so the button doesn't stay "Installed here" stale. */
  installedSignal?: unknown;
  /** Button label when nothing is installed yet — a package says how many items
   *  one click writes. Defaults to the plain Install label. */
  installLabel?: string;
  /** Refuse the install outright (an unresolvable package). */
  disabled?: boolean;
  /** Line above the selectors explaining what the chosen root receives; omitted
   *  for a plain skill, where the panel's meaning is already obvious. */
  scopeHint?: string | null;
}>();
const emit = defineEmits<{ install: [target: SkillInstallTarget] }>();

const provider = ref<SkillProviderTarget>(DEFAULT_SKILL_TARGET.provider);
const scope = ref<SkillInstallScope>(DEFAULT_SKILL_TARGET.scope);
// User scope is offered only when the SELECTED provider can actually resolve a
// user-scope skill under the live settings (default true when the option carries
// no flag, e.g. in tests). Otherwise a `user` install would write a skill the
// runtime silently won't load.
const selectedProviderUserScope = computed(
  () => props.skillProviderOptions?.find((o) => o.id === provider.value)?.userScope ?? true,
);
const scopeOptions = computed<readonly SkillInstallScope[]>(() =>
  selectedProviderUserScope.value ? SKILL_INSTALL_SCOPES : SKILL_INSTALL_SCOPES.filter((s) => s !== 'user'),
);
// Switching to a provider that can't resolve user scope while User is selected
// snaps the scope back to project, so a hidden option can't stay the target.
watch(selectedProviderUserScope, (allowed) => {
  if (!allowed && scope.value === 'user') scope.value = 'project';
});
const selectedTarget = computed<SkillInstallTarget>(() => ({ provider: provider.value, scope: scope.value }));
// Whether the skill is already installed at the CURRENTLY selected target (not
// "anywhere" — that is the detail's `installed` prop). Drives the button.
const selectedInstalled = ref(false);
let checkSeq = 0;

async function recheckSelectedInstalled(): Promise<void> {
  const checker = props.skillInstalledChecker;
  if (!checker) {
    selectedInstalled.value = false;
    return;
  }
  const seq = (checkSeq += 1);
  const result = await checker(selectedTarget.value).catch(() => false);
  if (seq === checkSeq) selectedInstalled.value = result; // ignore a superseded check
}

watch(
  [provider, scope, () => props.itemId, () => props.installing, () => props.installedSignal],
  () => void recheckSelectedInstalled(),
);

const buttonLabel = computed(() => {
  if (selectedInstalled.value) return t('marketplace.skill.installedHere');
  return props.installing ? t('marketplace.installing') : (props.installLabel ?? t('marketplace.install'));
});

function scopeLabel(value: SkillInstallScope): string {
  return value === 'project' ? t('marketplace.skill.scopeProject') : t('marketplace.skill.scopeUser');
}

onMounted(() => void recheckSelectedInstalled());
</script>

<template>
  <div class="specorator-vue-marketplace-skill-install">
    <p
      v-if="scopeHint"
      class="specorator-vue-marketplace-note"
    >
      {{ scopeHint }}
    </p>
    <div class="specorator-vue-marketplace-skill-fields">
      <label class="specorator-vue-marketplace-skill-field">
        <span>{{ t('marketplace.skill.providerLabel') }}</span>
        <select v-model="provider">
          <option
            v-for="opt in skillProviderOptions ?? []"
            :key="opt.id"
            :value="opt.id"
          >{{ opt.label }}</option>
        </select>
      </label>
      <label class="specorator-vue-marketplace-skill-field">
        <span>{{ t('marketplace.skill.scopeLabel') }}</span>
        <select v-model="scope">
          <option
            v-for="s in scopeOptions"
            :key="s"
            :value="s"
          >{{ scopeLabel(s) }}</option>
        </select>
      </label>
      <button
        type="button"
        class="mod-cta specorator-vue-marketplace-skill-install-btn"
        :disabled="installing || body === null || selectedInstalled || disabled === true"
        @click="emit('install', selectedTarget)"
      >
        {{ buttonLabel }}
      </button>
    </div>
    <p
      v-if="scope === 'user'"
      class="specorator-vue-marketplace-note"
    >
      {{ t('marketplace.skill.userScopeHint') }}
    </p>
  </div>
</template>

<style scoped>
.specorator-vue-marketplace-skill-install {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-xs);
  padding: var(--sp-space-s);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-s);
  background: var(--sp-surface-raised);
}

.specorator-vue-marketplace-skill-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--sp-space-s);
}

.specorator-vue-marketplace-skill-field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-3xs);
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-muted);
}

.specorator-vue-marketplace-skill-install-btn {
  margin-inline-start: auto;
}

/* Shared with the detail header's note chip; scoped styles are per-component,
   so this small rule is duplicated rather than hoisted to a global sheet. */
.specorator-vue-marketplace-note {
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-faint);
}
</style>
