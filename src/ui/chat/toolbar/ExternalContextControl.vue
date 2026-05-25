<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ExternalWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { NotificationPort } from '@/domain/ports';

/**
 * The external-context folder seam (SPEC-TC-019, REQ-TC-023). Presentational —
 * props in, NO event. Always rendered (full eight-widget parity, CLAR-TC-002 (a));
 * the paperclip-folder control is DISABLED. Activating it surfaces a non-blocking
 * `external.deferred` notice (via the optional `notify`) and OPENS NO PICKER, adds
 * no path, writes no `externalContextPaths` to any turn or to settings (REQ-TC-023,
 * SPEC-TC-029, NFR-TC-011). No `require('electron')`, no `FilePickerPort`. No
 * blocking dialog (NFR-TC-004). No `obsidian`/`v-html`. Claudian ground-truth:
 * `ExternalContextSelector`.
 */
const props = defineProps<{ vm: ExternalWidgetVm; notify?: NotificationPort }>();

const { t } = useI18n();

function onActivate(): void {
	props.notify?.showInfo(t('agent.chat.toolbar.external.deferred'));
}
</script>

<template>
	<button
		type="button"
		class="sp-toolbar-external"
		data-testid="toolbar-external"
		aria-disabled="true"
		:aria-label="t('agent.chat.toolbar.external.label')"
		@click="onActivate"
	>
		<span aria-hidden="true">📁</span>
	</button>
</template>

<style scoped>
.sp-toolbar-external {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	block-size: var(--sp-toolbar-widget-h);
	inline-size: var(--sp-toolbar-widget-h);
	border: 1px solid var(--sp-toggle-track);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
	color: var(--sp-text-muted);
	opacity: var(--sp-toolbar-disabled-opacity);
	cursor: pointer;
}
</style>
