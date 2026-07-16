<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { INPUT_WRAPPER_KEY } from '../composerKeys';
import { useComposerStore } from '../stores/composerStore';
import ComposerContextRow from './ComposerContextRow.vue';
import ComposerTextarea from './ComposerTextarea.vue';
import ComposerToolbar from './ComposerToolbar.vue';
import EditedFilesBar from './EditedFilesBar.vue';

const store = useComposerStore();

// ChatDropController queries `.specorator-input-wrapper` for the drop overlay
// and binds its listeners there. Vue OWNS the three wrapper-mode classes
// (formerly imperative `dom.inputWrapper.toggleClass(...)` in plan / instruction
// / bang-bash paths); the store is the single owner so a re-patch can't drop them.
const el = ref<HTMLElement | null>(null);
const register = inject(INPUT_WRAPPER_KEY, undefined);
onMounted(() => {
  if (el.value && el.value.nodeType === 1 && register) register(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="specorator-input-wrapper"
    :class="{
      'specorator-input-plan-mode': store.wrapperMode.planMode,
      'specorator-input-instruction-mode': store.wrapperMode.instructionMode,
      'specorator-input-bang-bash-mode': store.wrapperMode.bangBashMode,
    }"
  >
    <EditedFilesBar />
    <ComposerContextRow />
    <ComposerTextarea />
    <ComposerToolbar />
  </div>
</template>
