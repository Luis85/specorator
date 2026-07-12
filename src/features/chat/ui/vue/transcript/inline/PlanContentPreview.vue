<script setup lang="ts">
import MarkdownHost from '../MarkdownHost.vue';

/**
 * Vue port of `rendering/planContentPreview.ts`'s `renderPlanContentPreview`,
 * shared by `InlineExitPlanMode.vue` and `InlinePlanApproval.vue`. The legacy
 * function accepted an optional `renderContent` fallback (plain-text div when
 * absent); this component always renders through `MarkdownHost.vue` since a
 * real markdown renderer is reachable via injection everywhere this mounts.
 */
defineProps<{ content: string | null; errorMessage: string | null }>();
</script>

<template>
  <div
    v-if="content"
    class="specorator-plan-content-preview"
  >
    <MarkdownHost :markdown="content" />
  </div>
  <div
    v-else-if="errorMessage"
    class="specorator-plan-content-preview specorator-plan-read-error"
  >
    {{ errorMessage }}
  </div>
</template>
