<script setup lang="ts">
import { t } from '../../../../i18n/i18n';

// `busy` gates every action on the row: while one async card action runs the
// panel disables all three and marks aria-busy, dropping re-entrant fires.
defineProps<{ busy: boolean }>();
const emit = defineEmits<{
  'start-chat': [];
  clone: [];
  delete: [];
}>();
</script>

<template>
  <button
    type="button"
    class="mod-cta"
    :disabled="busy"
    :aria-busy="busy ? 'true' : undefined"
    @click="emit('start-chat')"
  >
    {{ t('agentRoster.startChatShort') }}
  </button>
  <button
    type="button"
    class="specorator-vue-card-icon"
    :aria-label="t('library.duplicate')"
    :title="t('library.duplicate')"
    :disabled="busy"
    :aria-busy="busy ? 'true' : undefined"
    @click="emit('clone')"
  >
    ⧉
  </button>
  <button
    type="button"
    class="specorator-vue-card-delete"
    :disabled="busy"
    :aria-busy="busy ? 'true' : undefined"
    @click="emit('delete')"
  >
    {{ t('agentRoster.delete') }}
  </button>
</template>
