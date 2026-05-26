<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PermissionWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { NotificationPort } from '@/domain/ports';
import type { PermissionMode } from '@/domain/chat/PermissionMode';

/**
 * The permission toggle (SPEC-TC-015 P6 seam + SPEC-AS-012 P7 live three-mode).
 *
 * **Additive.** When the optional live `mode` prop is supplied (the active tab's
 * `controls.permissionMode ?? 'normal'`, wired by `ChatSurface` in T-AS-029) the P6
 * honest-defer disabled seam is REPLACED by a live three-mode control: the fixed
 * `normal`/`plan`/`yolo` set (the invariant, CLAR-AS-002) rendered as a keyboard
 * `role="listbox"` (focus, Enter/Space activate the focused option, Arrow keys cycle
 * the three, Escape blurs). `plan` shows the "PLAN" label; `normal`/`yolo` show the
 * i18n mode label with `aria-selected` per the live mode; NO `aria-disabled`, NO
 * `permission.deferred` notice (the seam is removed, SPEC-AS-022). Selecting a mode
 * emits `set(mode)` up to the surface (REQ-AS-002).
 *
 * When `mode` is absent (no live wiring — the P6 toolbar today) the original
 * honest-defer disabled seam renders unchanged (REQ-TC-016, byte-identical P6). No
 * blocking dialog (NFR-AS-007). No `obsidian`/`v-html`. Claudian: `PermissionToggle`.
 */
const props = defineProps<{
	vm: PermissionWidgetVm;
	notify?: NotificationPort;
	mode?: PermissionMode;
}>();

const emit = defineEmits<{ set: [mode: PermissionMode] }>();

const { t } = useI18n();

const MODES: readonly PermissionMode[] = ['normal', 'plan', 'yolo'];

/** Live three-mode is active iff the surface supplies a `mode` prop (T-AS-029). */
const live = computed(() => props.mode !== undefined);

/** The active mode — the live prop, or (defer fallback) the vm's plan flag. */
const activeMode = computed<PermissionMode>(() => props.mode ?? (props.vm.plan ? 'plan' : 'normal'));

/** Show the PLAN label in place of the control (both the P6 seam + the live plan mode). */
const showPlanLabel = computed(() => activeMode.value === 'plan');

const label = computed(() => t('agent.chat.toolbar.permission.label'));

function modeLabel(mode: PermissionMode): string {
	return t(`agent.chat.toolbar.permission.mode.${mode}`);
}

const accessibleName = computed(() =>
	live.value ? `${label.value}: ${modeLabel(activeMode.value)}` : label.value,
);

// ── live keyboard control ─────────────────────────────────────────────────────────
const focusedIndex = ref(MODES.indexOf(activeMode.value));

watch(activeMode, (mode) => {
	focusedIndex.value = MODES.indexOf(mode);
});

function selectMode(mode: PermissionMode): void {
	emit('set', mode);
}

function moveFocus(delta: number): void {
	focusedIndex.value = (focusedIndex.value + delta + MODES.length) % MODES.length;
}

function activateFocused(): void {
	selectMode(MODES[focusedIndex.value]);
}

const FOCUS_DELTA: Readonly<Partial<Record<string, number>>> = {
	ArrowDown: 1,
	ArrowRight: 1,
	ArrowUp: -1,
	ArrowLeft: -1,
};

const ACTIVATE_KEYS: ReadonlySet<string> = new Set(['Enter', ' ']);

function onKeydown(event: KeyboardEvent): void {
	const delta = FOCUS_DELTA[event.key];
	if (delta !== undefined) {
		event.preventDefault();
		moveFocus(delta);
		return;
	}
	if (ACTIVATE_KEYS.has(event.key)) {
		if (event.isComposing) return;
		event.preventDefault();
		activateFocused();
		return;
	}
	if (event.key === 'Escape') {
		event.preventDefault();
		(event.currentTarget as HTMLElement | null)?.blur();
	}
}

// ── P6 honest-defer seam (when no live mode) ───────────────────────────────────────
/** The honest-defer affordance — a non-blocking notice; nothing persists. */
function onDeferredActivate(): void {
	props.notify?.showInfo(t('agent.chat.toolbar.permission.deferred'));
}
</script>

<template>
	<span
		v-if="showPlanLabel"
		class="sp-toolbar-permission__plan"
		data-testid="toolbar-permission-plan"
		:aria-label="accessibleName"
	>
		{{ t('agent.chat.toolbar.permission.plan') }}
	</span>

	<!-- P7 live three-mode control (SPEC-AS-012) -->
	<div
		v-else-if="live"
		class="sp-toolbar-permission sp-toolbar-permission--live"
		data-testid="toolbar-permission"
		role="listbox"
		tabindex="0"
		:aria-label="accessibleName"
		@keydown="onKeydown"
	>
		<button
			v-for="(m, i) in MODES"
			:key="m"
			type="button"
			class="sp-toolbar-permission__option"
			:class="{
				'sp-toolbar-permission__option--active': m === activeMode,
				'sp-toolbar-permission__option--focused': i === focusedIndex,
			}"
			data-testid="toolbar-permission-option"
			:data-mode="m"
			role="option"
			:aria-selected="m === activeMode ? 'true' : 'false'"
			@click="selectMode(m)"
		>
			<span dir="auto">{{ modeLabel(m) }}</span>
		</button>
	</div>

	<!-- P6 honest-defer disabled seam (no live mode wired) -->
	<button
		v-else
		type="button"
		class="sp-toolbar-permission"
		data-testid="toolbar-permission"
		role="switch"
		aria-checked="false"
		aria-disabled="true"
		:aria-label="label"
		@click="onDeferredActivate"
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

.sp-toolbar-permission--live {
	gap: var(--sp-space-1);
	color: var(--sp-text-normal);
	opacity: 1;
}

.sp-toolbar-permission__option {
	border: 1px solid transparent;
	border-radius: var(--sp-radius-sm);
	background: transparent;
	color: var(--sp-text-muted);
	padding-inline: var(--sp-space-2);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
}

.sp-toolbar-permission__option--active {
	border-color: var(--sp-permission-mode-active);
	color: var(--sp-permission-mode-active);
	font-weight: var(--sp-font-weight-semibold);
}

.sp-toolbar-permission__option--focused {
	border-color: var(--sp-permission-mode-active);
}

.sp-toolbar-permission__plan {
	display: inline-flex;
	align-items: center;
	block-size: var(--sp-toolbar-widget-h);
	border: 1px solid var(--sp-permission-mode-active);
	border-radius: var(--sp-radius-md);
	color: var(--sp-permission-mode-active);
	padding-inline: var(--sp-space-2);
	font-size: var(--sp-font-size-sm);
	font-weight: var(--sp-font-weight-semibold);
}
</style>
