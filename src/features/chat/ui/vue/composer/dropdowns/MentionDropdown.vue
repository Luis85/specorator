<script setup lang="ts">
import { computed, inject } from 'vue';

import { CALLBACKS_KEY } from '../composerKeys';
import { useComposerStore } from '../stores/composerStore';
import { fixedDropdownStyleVars } from './dropdownAnchor';
import DropdownList from './DropdownList.vue';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY, undefined);

const show = computed(() => store.dropdown.kind === 'mention');
// Same fixed-position dropup anchoring as the slash dropdown.
const style = computed(() => fixedDropdownStyleVars(store.dropdown.anchorRect));
</script>

<template>
  <div
    v-if="show"
    class="specorator-mention-dropdown specorator-mention-dropdown-fixed visible"
    :style="style"
  >
    <DropdownList
      :items="store.dropdown.items"
      :active-index="store.dropdown.activeIndex"
      root-class="specorator-mention-list"
      item-class="specorator-mention-item"
      empty-class="specorator-mention-empty"
      empty-text="No matches"
      content-class="specorator-mention-text"
      icon-class="specorator-mention-icon"
      primary-class="specorator-mention-name"
      secondary-class="specorator-mention-agent-desc"
      @select="(i: number) => cb?.onDropdownSelect(i)"
    />
  </div>
</template>
