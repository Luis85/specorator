<script setup lang="ts">
import { computed, inject } from 'vue';

import { CALLBACKS_KEY } from '../composerKeys';
import { useComposerStore } from '../stores/composerStore';
import DropdownList from './DropdownList.vue';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY, undefined);

// CSS-flow dropup (position:absolute; bottom:100%) inside the position:relative
// `.specorator-input-wrapper` — NO fixed positioning, so no anchor style vars.
const show = computed(() => store.dropdown.kind === 'resume');
</script>

<template>
  <div
    v-if="show"
    class="specorator-resume-dropdown visible"
  >
    <div class="specorator-resume-header">
      <span>Resume conversation</span>
    </div>
    <DropdownList
      :items="store.dropdown.items"
      :active-index="store.dropdown.activeIndex"
      root-class="specorator-resume-list"
      item-class="specorator-resume-item"
      empty-class="specorator-resume-empty"
      empty-text="No conversations"
      content-class="specorator-resume-item-content"
      content-tag="div"
      icon-class="specorator-resume-item-icon"
      primary-class="specorator-resume-item-title"
      primary-tag="div"
      secondary-class="specorator-resume-item-date"
      secondary-tag="div"
      @select="(i: number) => cb?.onDropdownSelect(i)"
    />
  </div>
</template>
