<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AttachedImage } from '@/domain/chat/attachments';

/**
 * A single image-context thumbnail (SPEC-CA-020, REQ-CA-008/009/011). Binds
 * `<img :src="resolveThumbSrc(image.path)">` DECLARATIVELY (no `v-html`/
 * `innerHTML`, NFR-CA-003); the resolved resource path is for DISPLAY only — the
 * turn payload is the base64 `dataBase64` (DESIGN-CA-001 A.2). The thumb is a
 * button, so Enter/Space + click emit `preview` (the parent launches the
 * `ImagePreviewModal` via the seam, REQ-CA-008); a labelled remove button emits
 * `remove` (REQ-CA-009). The component never imports `obsidian` — the resource
 * path is injected (NFR-CA-002). No `window.confirm`/`alert`/`prompt`.
 */
const props = defineProps<{
	image: AttachedImage;
	resolveThumbSrc: (path: string) => string;
}>();
const emit = defineEmits<{ remove: [path: string]; preview: [image: AttachedImage] }>();

const { t } = useI18n();

const src = computed(() => props.resolveThumbSrc(props.image.path));
const basename = computed(() => imageBasename(props.image.path));

function onPreviewKeydown(event: KeyboardEvent): void {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		emit('preview', props.image);
	}
}

/** The path's basename (with extension — the `alt` text). */
function imageBasename(path: string): string {
	const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
	return slash >= 0 ? path.slice(slash + 1) : path;
}
</script>

<template>
	<div class="sp-image-thumb" data-testid="image-thumb">
		<button
			type="button"
			class="sp-image-thumb__preview"
			data-testid="image-thumb-preview"
			:aria-label="t('agent.chat.context.images.preview', { name: basename })"
			@click="emit('preview', image)"
			@keydown="onPreviewKeydown"
		>
			<img class="sp-image-thumb__img" data-testid="image-thumb-img" :src="src" :alt="basename" />
		</button>
		<button
			type="button"
			class="sp-image-thumb__remove"
			data-testid="image-thumb-remove"
			:aria-label="t('agent.chat.context.images.remove', { name: basename })"
			@click="emit('remove', image.path)"
		>
			<span aria-hidden="true">×</span>
		</button>
	</div>
</template>

<style scoped>
.sp-image-thumb {
	position: relative;
	display: inline-flex;
}

.sp-image-thumb__preview {
	border: 1px solid var(--sp-chip-border);
	border-radius: var(--sp-chip-radius);
	background: var(--sp-chip-bg);
	padding: 0;
	cursor: pointer;
	overflow: hidden;
	line-height: 0;
}

.sp-image-thumb__img {
	inline-size: var(--sp-image-thumb-size);
	block-size: var(--sp-image-thumb-size);
	object-fit: cover;
	display: block;
}

.sp-image-thumb__remove {
	position: absolute;
	inset-block-start: 0;
	inset-inline-end: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border: none;
	background: var(--sp-bg-primary);
	color: var(--sp-text-muted);
	cursor: pointer;
	line-height: 1;
	border-radius: var(--sp-radius-full);
}

.sp-image-thumb__remove:hover {
	color: var(--sp-text-normal);
}
</style>
