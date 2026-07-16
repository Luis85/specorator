<script setup lang="ts">
import { computed, inject } from 'vue';

import { CALLBACKS_KEY } from '../composerKeys';
import { useComposerStore } from '../stores/composerStore';
import { fixedDropdownStyleVars } from './dropdownAnchor';
import DropdownList from './DropdownList.vue';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY, undefined);

const show = computed(() => store.dropdown.kind === 'slash');
// Fixed-position dropup anchored to the textarea rect (see fixedDropdownStyleVars).
const style = computed(() => fixedDropdownStyleVars(store.dropdown.anchorRect));
</script>

<template>
  <div
    v-if="show"
    class="specorator-slash-dropdown specorator-slash-dropdown-fixed visible"
    :style="style"
  >
    <DropdownList
      :items="store.dropdown.items"
      :active-index="store.dropdown.activeIndex"
      root-class="specorator-slash-list"
      item-class="specorator-slash-item"
      empty-class="specorator-slash-empty"
      empty-text="No matching commands"
      primary-class="specorator-slash-name"
      hint-class="specorator-slash-hint"
      secondary-class="specorator-slash-desc"
      secondary-tag="div"
      @select="(i: number) => cb?.onDropdownSelect(i)"
    />
  </div>
</template>
