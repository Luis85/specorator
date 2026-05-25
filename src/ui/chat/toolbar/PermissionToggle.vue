<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PermissionWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { NotificationPort } from '@/domain/ports';

/**
 * The permission display + honest-defer seam (SPEC-TC-015, REQ-TC-015/016/041).
 * Presentational — props in, NO event that persists a rule. When `vm.plan` the
 * toggle is replaced by the "PLAN" label (display only — P6 does not own plan
 * mode, NG6). Otherwise it shows a DISABLED `role="switch"`; activating the
 * deferred control surfaces a non-blocking `permission.deferred` notice (via the
 * optional `notify`) and PERSISTS NO RULE, writes no `data.json`, gates no tool
 * call (REQ-TC-016, SPEC-TC-029). No blocking dialog (NFR-TC-004). No
 * `obsidian`/`v-html`. Claudian ground-truth: `PermissionToggle`.
 */
const props = defineProps<{ vm: PermissionWidgetVm; notify?: NotificationPort }>();

const { t } = useI18n();

const label = computed(() => t('agent.chat.toolbar.permission.label'));

/** The honest-defer affordance — a non-blocking notice; nothing persists. */
function onActivate(): void {
	props.notify?.showInfo(t('agent.chat.toolbar.permission.deferred'));
}
</script>

<template>
	<span
		v-if="vm.plan"
		class="sp-toolbar-permission__plan"
		data-testid="toolbar-permission-plan"
		:aria-label="label"
	>
		{{ t('agent.chat.toolbar.permission.plan') }}
	</span>
	<button
		v-else
		type="button"
		class="sp-toolbar-permission"
		data-testid="toolbar-permission"
		role="switch"
		aria-checked="false"
		aria-disabled="true"
		:aria-label="label"
		@click="onActivate"
	>
		<span dir="auto">{{ label }}</span>
	</button>
</template>

<style scoped>
.sp-toolbar-permission {
	display: inline-flex;
	align-items: center;
	block-size: var(--sp-toolbar-widget-h);
	border: 1px solid var(--sp-toggle-track);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
	color: var(--sp-text-muted);
	padding-inline: var(--sp-space-2);
	font-size: var(--sp-font-size-sm);
	opacity: var(--sp-toolbar-disabled-opacity);
	cursor: pointer;
}

.sp-toolbar-permission__plan {
	display: inline-flex;
	align-items: center;
	block-size: var(--sp-toolbar-widget-h);
	border: 1px solid var(--sp-toggle-active);
	border-radius: var(--sp-radius-md);
	color: var(--sp-toggle-active);
	padding-inline: var(--sp-space-2);
	font-size: var(--sp-font-size-sm);
	font-weight: var(--sp-font-weight-semibold);
}
</style>
