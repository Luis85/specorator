<script setup lang="ts">
// Reproduces Obsidian's standard `Setting` row DOM (`.setting-item` with an info
// name/description block + a control slot) so the template editor keeps
// Obsidian's built-in row styling without adding any new CSS — the imperative
// modal built every row through `new Setting(...)`. `extraClass` carries the
// per-row modifier classes the imperative applied to specific `settingEl`s
// (e.g. `specorator-icon-picker-setting`, `specorator-wo-template-body-setting`).
defineProps<{ name?: string; desc?: string; extraClass?: string }>();
</script>

<template>
  <div
    class="setting-item"
    :class="extraClass"
  >
    <div class="setting-item-info">
      <div class="setting-item-name">
        {{ name }}
      </div>
      <div class="setting-item-description">
        {{ desc }}
      </div>
    </div>
    <div class="setting-item-control">
      <slot />
    </div>
  </div>
</template>
