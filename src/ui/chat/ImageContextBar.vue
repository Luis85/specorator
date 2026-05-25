<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { AttachedImage } from '@/domain/chat/attachments';
import ImageThumb from './ImageThumb.vue';

/**
 * The image-context thumbnail bar (SPEC-CA-020, REQ-CA-007/008/009/011). Renders
 * the image-context set as a row of `ImageThumb`s. The `resolveThumbSrc` callback
 * (the Obsidian-resolved resource path) is INJECTED — the component never imports
 * `obsidian` (NFR-CA-002). Opening a thumb re-emits `preview: [image]` (the
 * parent launches the `ImagePreviewModal` via the seam); removing re-emits
 * `remove: [path]`. The turn payload remains the base64 `dataBase64`
 * (DESIGN-CA-001 A.2). No `v-html`; no `window.confirm`/`alert`/`prompt`.
 */
defineProps<{
	images: readonly AttachedImage[];
	resolveThumbSrc: (path: string) => string;
}>();
const emit = defineEmits<{ remove: [path: string]; preview: [image: AttachedImage] }>();

const { t } = useI18n();
</script>

<template>
	<div
		class="sp-image-context-bar"
		data-testid="image-context-bar"
		role="group"
		:aria-label="t('agent.chat.context.images.label')"
	>
		<ImageThumb
			v-for="image in images"
			:key="image.path"
			:image="image"
			:resolve-thumb-src="resolveThumbSrc"
			@preview="emit('preview', $event)"
			@remove="emit('remove', $event)"
		/>
	</div>
</template>

<style scoped>
.sp-image-context-bar {
	display: flex;
	flex-wrap: wrap;
	gap: var(--sp-context-bar-gap);
}
</style>
