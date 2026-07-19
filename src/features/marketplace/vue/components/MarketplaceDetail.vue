<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { MarketplaceItem } from '../../catalogTypes';
import {
  DEFAULT_SKILL_TARGET,
  SKILL_INSTALL_SCOPES,
  type SkillInstallScope,
  type SkillInstallTarget,
  type SkillProviderTarget,
} from '../../skillInstallTargets';
import { iconForItem, mountLucide } from '../marketplaceIcons';

const props = defineProps<{
  item: MarketplaceItem;
  typeLabel: string;
  body: string | null;
  previewError: boolean;
  installing: boolean;
  installed: boolean;
  installable: boolean;
  /** Skills only — the provider targets to offer, labeled from the registry.
   *  `userScope` is whether a user-scope install resolves for that provider under
   *  the live settings (Claude ties it to `loadUserSettings`); User scope is hidden
   *  when it's false so a skill isn't written where the runtime won't load it. */
  skillProviderOptions?: { id: SkillProviderTarget; label: string; userScope?: boolean }[];
  /** Skills only — resolves whether the skill already exists at a given target. */
  skillInstalledChecker?: (target: SkillInstallTarget) => Promise<boolean>;
  /** Skills only — a value whose identity changes when the store recomputes its
   *  installed state (an external Library skill delete/rename fires
   *  `vaultSkill.changed` → `refreshInstalled`); the per-target check reruns on it
   *  so the button doesn't stay "Installed here" after the skill is removed. */
  installedSignal?: unknown;
}>();
const emit = defineEmits<{ back: []; install: [target?: SkillInstallTarget] }>();

const rootEl = ref<HTMLElement | null>(null);
const nameEl = ref<HTMLElement | null>(null);

// --- Skill install target (provider + scope) --------------------------------
const isSkill = computed(() => props.item.type === 'skill');
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
// "anywhere" — that is the `installed` prop). Drives the per-target button.
const selectedInstalled = ref(false);
let checkSeq = 0;

async function recheckSelectedInstalled(): Promise<void> {
  const checker = props.skillInstalledChecker;
  if (!isSkill.value || !checker) {
    selectedInstalled.value = false;
    return;
  }
  const seq = (checkSeq += 1);
  const result = await checker(selectedTarget.value).catch(() => false);
  if (seq === checkSeq) selectedInstalled.value = result; // ignore a superseded check
}

// Re-check when the target changes, the item changes, an install finishes
// (installing true→false), or the store recomputes installed state (installedSignal
// — e.g. an external Library skill delete). Keeps the button honest without a reopen.
watch(
  [provider, scope, () => props.item.id, () => props.installing, () => props.installedSignal],
  () => void recheckSelectedInstalled(),
);

function scopeLabel(value: SkillInstallScope): string {
  return value === 'project' ? t('marketplace.skill.scopeProject') : t('marketplace.skill.scopeUser');
}

// Nearest scrollable ancestor (Obsidian's `.view-content` in practice), found by
// overflow rather than a hardcoded host class.
function scrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

onMounted(() => {
  // A view change: reset the scroll container to the top (opening a card from a
  // scrolled list would otherwise hide the Back button / header), and move focus
  // into the new view so keyboard + screen-reader users don't fall back to
  // <body> with no announcement.
  const scroller = scrollableAncestor(rootEl.value);
  if (scroller) scroller.scrollTop = 0;
  nameEl.value?.focus({ preventScroll: true });
  void recheckSelectedInstalled();
});

const bodyText = computed(() =>
  props.previewError ? t('marketplace.loadError') : (props.body ?? t('marketplace.loading')),
);

// The catalog is untrusted: only an http(s) source becomes a live href (Vue does
// not sanitize :href, and a javascript: value would execute in the renderer).
const safeSourceUrl = computed(() => {
  const src = props.item.source;
  return src && /^https?:\/\//i.test(src) ? src : null;
});
</script>

<template>
  <div
    ref="rootEl"
    class="specorator-vue-marketplace-detail"
  >
    <button
      type="button"
      class="specorator-vue-marketplace-back"
      @click="emit('back')"
    >
      {{ t('marketplace.detail.back') }}
    </button>
    <div class="specorator-vue-marketplace-detail-head">
      <div
        :ref="(el) => mountLucide(el, iconForItem(props.item))"
        class="specorator-vue-marketplace-card-icon is-lg"
      />
      <div class="specorator-vue-marketplace-detail-titles">
        <!-- tabindex -1 + programmatic focus on mount announces the view change
          to screen readers and keeps keyboard focus inside the detail. -->
        <div
          ref="nameEl"
          tabindex="-1"
          class="specorator-vue-marketplace-detail-name"
        >
          {{ props.item.name }}
        </div>
        <span class="specorator-vue-marketplace-card-badge">{{ props.typeLabel }}</span>
      </div>
      <div class="specorator-vue-marketplace-detail-action">
        <!-- Skills carry their own install panel below (provider + scope), so the
             header only shows an informational "installed somewhere" chip. -->
        <template v-if="isSkill">
          <span
            v-if="props.installed"
            class="specorator-vue-marketplace-note"
          >{{ t('marketplace.installed') }}</span>
        </template>
        <template v-else>
          <span v-if="props.installed">{{ t('marketplace.installed') }}</span>
          <span
            v-else-if="!props.installable"
            class="specorator-vue-marketplace-note"
          >{{ t('marketplace.notInstallable') }}</span>
          <button
            v-else
            type="button"
            class="mod-cta"
            :disabled="props.installing || props.body === null"
            @click="emit('install')"
          >
            {{ props.installing ? t('marketplace.installing') : t('marketplace.install') }}
          </button>
        </template>
      </div>
    </div>
    <div
      v-if="props.item.tags.length > 0"
      class="specorator-vue-marketplace-card-tags"
    >
      <span
        v-for="tag in props.item.tags"
        :key="tag"
        class="specorator-vue-chip"
      >{{ tag }}</span>
    </div>
    <p
      v-if="props.item.description"
      class="specorator-vue-marketplace-detail-desc"
    >
      {{ props.item.description }}
    </p>
    <div
      v-if="isSkill"
      class="specorator-vue-marketplace-skill-install"
    >
      <div class="specorator-vue-marketplace-skill-fields">
        <label class="specorator-vue-marketplace-skill-field">
          <span>{{ t('marketplace.skill.providerLabel') }}</span>
          <select v-model="provider">
            <option
              v-for="opt in props.skillProviderOptions ?? []"
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
          :disabled="props.installing || props.body === null || selectedInstalled"
          @click="emit('install', selectedTarget)"
        >
          {{ selectedInstalled
            ? t('marketplace.skill.installedHere')
            : (props.installing ? t('marketplace.installing') : t('marketplace.install')) }}
        </button>
      </div>
      <p
        v-if="scope === 'user'"
        class="specorator-vue-marketplace-note"
      >
        {{ t('marketplace.skill.userScopeHint') }}
      </p>
    </div>
    <pre class="specorator-vue-marketplace-body">{{ bodyText }}</pre>
    <div
      v-if="props.item.author || props.item.license || props.item.source"
      class="specorator-vue-marketplace-attribution"
    >
      <span v-if="props.item.author">{{ props.item.author }}</span>
      <span v-if="props.item.license">{{ props.item.license }}</span>
      <a
        v-if="safeSourceUrl"
        :href="safeSourceUrl"
        target="_blank"
        rel="noopener noreferrer"
      >{{ props.item.source }}</a>
      <span v-else-if="props.item.source">{{ props.item.source }}</span>
    </div>
  </div>
</template>

<style scoped>
.specorator-vue-marketplace-detail {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-s);
}

.specorator-vue-marketplace-back {
  align-self: flex-start;
  font-size: var(--sp-font-small);
  padding: var(--sp-space-3xs) var(--sp-space-xs);
  border-radius: var(--sp-radius-s);
  cursor: pointer;
}

.specorator-vue-marketplace-detail-head {
  display: flex;
  align-items: center;
  gap: var(--sp-space-s);
}

.specorator-vue-marketplace-detail-titles {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-3xs);
  flex: 1 1 auto;
  min-width: 0;
}

.specorator-vue-marketplace-detail-name {
  font-size: 1.15em;
  font-weight: var(--sp-weight-semibold);
}

.specorator-vue-marketplace-detail-action {
  flex: 0 0 auto;
}

.specorator-vue-marketplace-note {
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-faint);
}

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

.specorator-vue-marketplace-detail-desc {
  color: var(--sp-text-muted);
  user-select: text;
}

.specorator-vue-marketplace-body {
  max-height: 24rem;
  margin: 0;
  padding: var(--sp-space-s);
  overflow: auto;
  font-family: var(--sp-mono);
  font-size: var(--sp-font-smaller);
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-s);
  user-select: text;
}

.specorator-vue-marketplace-attribution {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-s);
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-faint);
  user-select: text;
}
</style>
