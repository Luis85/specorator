<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import SpCollapsible from './SpCollapsible.vue';
import MarkdownBlock from './MarkdownBlock.vue';

/**
 * Renders an extended-thinking block (SPEC-RR-027). Live: a brand-coloured
 * (`--sp-thinking-color`) italic `"Thinking Ns…"` label whose second-count
 * increments each second (a 1s interval started on mount) with a pulse
 * (`--sp-thinking-pulse-duration`, `0s` under reduced-motion — REQ-RR-017).
 * Finalise (`live` → false): stop the interval, freeze the label to
 * `"Thought for Ns"` (elapsed seconds, no `…`), and auto-collapse the block
 * (REQ-RR-014). The interval is cleared on finalise AND unmount (EC-RR-7 — no
 * leaked timer). Reasoning text renders through `MarkdownBlock` (declarative, no
 * `v-html`). Mirrors claudian-main `createThinkingBlock`/`finalizeThinkingBlock`.
 */
const props = defineProps<{
	block: { type: 'thinking'; content: string; durationSeconds?: number };
	live: boolean;
}>();

const collapsible = ref<InstanceType<typeof SpCollapsible> | null>(null);

const startTime = Date.now();
const elapsed = ref(0);
/** The frozen duration once finalised (seconds); `null` while still live. */
const frozenDuration = ref<number | null>(props.live ? null : (props.block.durationSeconds ?? 0));
let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer(): void {
	if (timer !== null) {
		clearInterval(timer);
		timer = null;
	}
}

function startTimer(): void {
	if (timer !== null) return;
	timer = setInterval(() => {
		elapsed.value = Math.floor((Date.now() - startTime) / 1000);
	}, 1000);
}

function finalise(): void {
	stopTimer();
	frozenDuration.value = Math.floor((Date.now() - startTime) / 1000);
	collapsible.value?.collapse();
}

if (props.live) startTimer();

watch(
	() => props.live,
	(isLive) => {
		if (isLive) {
			startTimer();
		} else {
			finalise();
		}
	},
);

onBeforeUnmount(stopTimer);

const label = computed(() =>
	frozenDuration.value !== null
		? `Thought for ${frozenDuration.value}s`
		: `Thinking ${elapsed.value}s…`,
);
</script>

<template>
	<div class="sp-thinking" data-testid="thinking-block">
		<SpCollapsible ref="collapsible" variant="thinking" label="Extended thinking">
			<template #header>
				<span
					class="sp-thinking__label"
					:class="{ 'sp-thinking__label--live': live }"
					data-testid="thinking-label"
					>{{ label }}</span
				>
			</template>
			<MarkdownBlock :content="block.content" />
		</SpCollapsible>
	</div>
</template>

<style scoped>
.sp-thinking__label {
	color: var(--sp-thinking-color);
	font-style: italic;
	font-size: var(--sp-font-size-sm);
}

.sp-thinking__label--live {
	animation: sp-thinking-pulse var(--sp-thinking-pulse-duration) ease-in-out infinite;
}

@keyframes sp-thinking-pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.55;
	}
}

@media (prefers-reduced-motion: reduce) {
	.sp-thinking__label--live {
		animation: none;
	}
}
</style>
