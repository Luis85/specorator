<script setup lang="ts">
import { appendMcpIcon } from '../../../../../../shared/icons';
import { mountIcon } from '../../mountIcon';
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
  /** Per-skin class for the leading `item.iconId` glyph (mention / resume). */
  iconClass?: string;
}>(), {
  primaryTag: 'span',
  secondaryTag: 'span',
  contentTag: 'span',
});

const emit = defineEmits<{ (e: 'select', index: number): void }>();

// Function ref per row: the imperative dropdowns painted their leading glyph
// with `setIcon` / `appendMcpIcon` on a span, and the repo bans markup strings,
// so paint the icon onto the real element rather than emitting an SVG string.
// Re-invoked on every render (keyed rows), which repaints on `iconId` change;
// both painters replace the element's content, so repainting is idempotent.
function paintIcon(el: unknown, iconId: string | undefined): void {
  if (el == null || (el as Partial<Node>).nodeType !== 1 || !iconId) return;
  if (iconId === 'mcp') { appendMcpIcon(el as HTMLElement); return; }
  mountIcon(el, iconId);
}
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
      @click.stop
    >
      <span
        v-if="item.iconId"
        :ref="(el) => paintIcon(el, item.iconId)"
        :class="iconClass"
      />
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
        <span
          v-if="item.hint"
          :class="hintClass"
        >
          {{ item.hint }}
        </span>
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
