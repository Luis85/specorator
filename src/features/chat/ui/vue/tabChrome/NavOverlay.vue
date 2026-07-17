<script setup lang="ts">
import { computed, inject } from 'vue';

import { mountIcon } from '../mountIcon';
import { NAV_HOST_KEY } from './tabChromeKeys';
import { useTabNavigation } from './useTabNavigation';

// Teleported 4-button scroll navigator (replaces the imperative NavigationSidebar).
// Vue renders the buttons + `.visible` toggle; useTabNavigation owns the imperative
// scroll geometry bound to the transcript scroll host.
const navHost = inject(NAV_HOST_KEY, () => null);
const target = computed(() => navHost());
const teleportDisabled = computed(() => target.value == null);

const { visible, scrollTop, scrollBottom, scrollPrev, scrollNext } = useTabNavigation();

function topIcon(el: unknown): void { mountIcon(el, 'chevrons-up'); }
function prevIcon(el: unknown): void { mountIcon(el, 'chevron-up'); }
function nextIcon(el: unknown): void { mountIcon(el, 'chevron-down'); }
function bottomIcon(el: unknown): void { mountIcon(el, 'chevrons-down'); }
</script>

<template>
  <Teleport
    :to="target"
    :disabled="teleportDisabled"
  >
    <div
      class="specorator-nav-sidebar"
      :class="{ visible }"
    >
      <div
        :ref="topIcon"
        class="specorator-nav-btn specorator-nav-btn-top"
        aria-label="Scroll to top"
        @click="scrollTop()"
      />
      <div
        :ref="prevIcon"
        class="specorator-nav-btn specorator-nav-btn-prev"
        aria-label="Previous message"
        @click="scrollPrev()"
      />
      <div
        :ref="nextIcon"
        class="specorator-nav-btn specorator-nav-btn-next"
        aria-label="Next message"
        @click="scrollNext()"
      />
      <div
        :ref="bottomIcon"
        class="specorator-nav-btn specorator-nav-btn-bottom"
        aria-label="Scroll to bottom"
        @click="scrollBottom()"
      />
    </div>
  </Teleport>
</template>
