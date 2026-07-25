<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { MarketplaceItem, MarketplaceItemType } from '../../catalogTypes';
import type { SkillInstallTarget, SkillProviderTarget } from '../../skillInstallTargets';
import { iconForItem, mountLucide } from '../marketplaceIcons';
import { useDependencyInstalledSet } from '../useDependencyInstalledSet';
import MarketplaceInstallAction from './MarketplaceInstallAction.vue';
import MarketplacePackageList from './MarketplacePackageList.vue';
import MarketplaceSkillInstall from './MarketplaceSkillInstall.vue';

const props = defineProps<{
  item: MarketplaceItem;
  typeLabel: string;
  /** The item's resolved package dependencies, in install order (empty when it
   *  stands alone). Installing the item installs these first. */
  dependencies?: MarketplaceItem[];
  /** Why the package can't be installed (an absent dependency, a cycle), or null.
   *  Set means Install is refused — a package installs whole or not at all. */
  packageError?: string | null;
  /** Labels for the dependency list's type badges. */
  typeLabels?: Record<MarketplaceItemType, string>;
  /** Catalog ids already installed anywhere — the fallback for dependency
   *  markers when no skill target is being chosen. */
  installedIds?: ReadonlySet<string>;
  /** Resolves one package member against one target — skills against that
   *  provider + scope, everything else against its single vault home. */
  memberInstalledAt?: (item: MarketplaceItem, target: SkillInstallTarget) => Promise<boolean>;
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
  /** Resolves whether everything this install would write is already present at
   *  a given target — the item's own skill, or a package's skill dependencies,
   *  checked against the CHOSEN provider + scope rather than "anywhere". */
  skillInstalledChecker?: (target: SkillInstallTarget) => Promise<boolean>;
  /** A value whose identity changes when the store recomputes its
   *  installed state (an external Library skill delete/rename fires
   *  `vaultSkill.changed` → `refreshInstalled`); the per-target check reruns on it
   *  so the button doesn't stay "Installed here" after the skill is removed. */
  installedSignal?: unknown;
}>();
const emit = defineEmits<{ back: []; install: [target?: SkillInstallTarget] }>();

const rootEl = ref<HTMLElement | null>(null);
const nameEl = ref<HTMLElement | null>(null);

const isSkill = computed(() => props.item.type === 'skill');
const dependencies = computed(() => props.dependencies ?? []);
const isPackage = computed(() => dependencies.value.length > 0);
// The provider + scope panel is shown for a skill AND for any item whose package
// contains skills (an agent that brings the skills it works through) — those
// skills need a root to install into just the same.
const needsSkillTarget = computed(
  () => isSkill.value || dependencies.value.some((dependency) => dependency.type === 'skill'),
);
// What "installed" means in the HEADER differs by case. With a target panel the
// header only reports "installed somewhere" — the per-target truth lives in the
// panel. Without one the header speaks for the whole package, so every dependency
// must be present too, and a partially-installed package still offers Install to
// complete itself.
const headerInstalled = computed(() =>
  needsSkillTarget.value
    ? props.installed
    : props.installed &&
      dependencies.value.every((dependency) => props.installedIds?.has(dependency.id) ?? false),
);
// The target the panel below currently has selected (null until it publishes one).
const selectedTarget = ref<SkillInstallTarget | null>(null);
const targetInstalledIds = useDependencyInstalledSet(
  () => dependencies.value,
  () => selectedTarget.value,
  () => props.memberInstalledAt,
  () => props.installedSignal,
);
// Scope the dependency markers to the destination being configured. Without a
// target panel there is no destination to scope to, so the catalog-wide set is
// the honest answer; with one, "installed" must mean "installed HERE" or the
// list contradicts the button beside it.
const dependencyInstalledIds = computed(() =>
  needsSkillTarget.value && selectedTarget.value !== null
    ? targetInstalledIds.value
    : (props.installedIds ?? new Set<string>()),
);
const installLabel = computed(() =>
  isPackage.value
    ? t('marketplace.package.install', { count: dependencies.value.length + 1 })
    : t('marketplace.install'),
);

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
        <MarketplaceInstallAction
          :deferred-to-target-panel="needsSkillTarget"
          :installed="headerInstalled"
          :installable="props.installable"
          :installing="props.installing"
          :body-loaded="props.body !== null"
          :blocked="!!props.packageError"
          :install-label="installLabel"
          @install="emit('install')"
        />
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
    <MarketplacePackageList
      :dependencies="dependencies"
      :type-labels="props.typeLabels"
      :installed-ids="dependencyInstalledIds"
      :error="props.packageError"
    />
    <MarketplaceSkillInstall
      v-if="needsSkillTarget"
      :skill-provider-options="props.skillProviderOptions"
      :skill-installed-checker="props.skillInstalledChecker"
      :installing="props.installing"
      :body="props.body"
      :item-id="props.item.id"
      :installed-signal="props.installedSignal"
      :install-label="installLabel"
      :disabled="!!props.packageError"
      :scope-hint="isPackage ? t('marketplace.package.skillTargetHint') : null"
      @install="emit('install', $event)"
      @update:target="selectedTarget = $event"
    />
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
