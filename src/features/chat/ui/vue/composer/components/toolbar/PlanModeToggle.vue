<script setup lang="ts">
import { inject } from 'vue';

import { t } from '../../../../../../../i18n/i18n';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';
import { useToolbarIcon } from './useToolbarIcon';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const iconEl = useToolbarIcon('map');
</script>

<template>
  <div
    v-if="store.toolbar.planMode.visible"
    class="specorator-plan-mode-toggle"
  >
    <div
      class="specorator-plan-mode-button"
      :class="{ active: store.toolbar.planMode.active }"
      :aria-pressed="store.toolbar.planMode.active"
      :aria-label="t('chat.planMode.ariaLabel')"
      :title="store.toolbar.planMode.active ? t('chat.planMode.titleActive') : t('chat.planMode.titleInactive')"
      @click="cb?.onTogglePlanMode()"
    >
      <span
        ref="iconEl"
        class="specorator-plan-mode-icon"
      />
    </div>
  </div>
</template>
