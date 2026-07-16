<script setup lang="ts">
import type { ComposerDropdownItem } from '../stores/composerStore';

// ONE list renderer, three skins via props. The three chat dropdowns
// (slash / mention / resume) differ only in class vocabulary and child element
// tags, so parameterizing those here keeps them from forming a clone group.
// `@mousedown.prevent` (not `@click`): the imperative dropdowns committed on
// mousedown so the textarea never lost focus before the insert ran.
withDefaults(defineProps<{
  items: ComposerDropdownItem[];
  activeIndex: number;
  rootClass: string;
  itemClass: string;
  emptyClass: string;
  emptyText: string;
  /** Primary text child (slash name / mention name / resume title). */
  primaryClass: string;
  primaryTag?: string;
  /** Optional secondary text child (slash desc / mention agent-desc / resume date). */
  secondaryClass?: string;
  secondaryTag?: string;
  /** Optional inline hint child (slash argument hint). */
  hintClass?: string;
  /** Optional wrapper around primary+secondary (mention-text / resume-item-content). */
  contentClass?: string;
  contentTag?: string;
}>(), {
  primaryTag: 'span',
  secondaryTag: 'span',
  contentTag: 'span',
});

const emit = defineEmits<{ (e: 'select', index: number): void }>();
</script>

<template>
  <div :class="rootClass">
    <div
      v-if="items.length === 0"
      :class="emptyClass"
    >
      {{ emptyText }}
    </div>
    <div
      v-for="(item, i) in items"
      v-else
      :key="item.id"
      :class="[itemClass, item.variant, { selected: i === activeIndex }]"
      @mousedown.prevent="emit('select', i)"
    >
      <component
        :is="contentTag"
        v-if="contentClass"
        :class="contentClass"
      >
        <component
          :is="primaryTag"
          :class="primaryClass"
        >
          {{ item.primary }}
        </component>
        <component
          :is="secondaryTag"
          v-if="item.secondary"
          :class="secondaryClass"
        >
          {{ item.secondary }}
        </component>
      </component>
      <template v-else>
        <component
          :is="primaryTag"
          :class="primaryClass"
        >
          {{ item.primary }}
        </component>
        <component
          :is="'span'"
          v-if="item.hint"
          :class="hintClass"
        >
          {{ item.hint }}
        </component>
        <component
          :is="secondaryTag"
          v-if="item.secondary"
          :class="secondaryClass"
        >
          {{ item.secondary }}
        </component>
      </template>
    </div>
  </div>
</template>
