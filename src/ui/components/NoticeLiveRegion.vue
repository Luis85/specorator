<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

/**
 * The standalone notice live region (SPEC-AY-004, REQ-AY-010). A visually-hidden
 * (`.sr-only`) ARIA live region that announces non-blocking notices to screen
 * readers in the standalone / GitHub Pages host, where the Obsidian native
 * `Notice` (the plugin leg, announced by the host) is not present.
 *
 * It subscribes to the existing `sp:notice` window `CustomEvent` that
 * `LocalStorageBridge` already dispatches (error/warning/success/info severity) —
 * NO new port, NO new channel (the spec's Observability note). Error notices map
 * to `aria-live="assertive"` + `role="alert"` (they interrupt); info/success/
 * warning map to `aria-live="polite"` + `role="status"`. The notice text is bound
 * DECLARATIVELY as `{{ }}` text — never `innerHTML`/`v-html` (REQ-AY-015,
 * NFR-AY-003). The region is passive: it never calls `.focus()`, so an
 * announcement never steals focus (EC-AY-011/012). The `.sr-only` clip (RG-6)
 * gives it zero visible footprint, so the default render stays additive
 * (REQ-AY-014).
 */
interface NoticeDetail {
	severity: 'error' | 'warning' | 'success' | 'info';
	message: string;
}

const message = ref('');
const severity = ref<NoticeDetail['severity']>('info');

const isAssertive = computed(() => severity.value === 'error');
const ariaLive = computed(() => (isAssertive.value ? 'assertive' : 'polite'));
const role = computed(() => (isAssertive.value ? 'alert' : 'status'));

function onNotice(event: Event): void {
	// A runtime event may carry a malformed detail; type it nullable so the guard
	// is meaningful (the DOM `CustomEvent.detail` static type is non-nullable).
	const detail = (event as CustomEvent).detail as Partial<NoticeDetail> | null | undefined;
	if (detail === null || detail === undefined) return;
	severity.value = detail.severity ?? 'info';
	message.value = detail.message ?? '';
}

onMounted(() => {
	window.addEventListener('sp:notice', onNotice);
});

onBeforeUnmount(() => {
	window.removeEventListener('sp:notice', onNotice);
});
</script>

<template>
	<div
		class="sr-only"
		data-testid="notice-live-region"
		:aria-live="ariaLive"
		:role="role"
		aria-atomic="true"
	>
		{{ message }}
	</div>
</template>
