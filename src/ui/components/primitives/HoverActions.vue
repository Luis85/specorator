<script setup lang="ts">
/**
 * HoverActions — canonical hover/focus-reveal slot wrapper (ADR-AUX-003,
 * spec §1.3.2 / §3.1, REQ-AUX-002).
 *
 * Children are placed inside a `<div role="toolbar">` whose `opacity`
 * (and ONLY opacity) is driven by the parent `.sp-hover-host`
 * `:hover` / `:focus-within` selectors. The accessibility tree is
 * preserved at every state — never `display: none` or `visibility: hidden`.
 *
 * **Consumer contract.** The parent row that drives the reveal MUST carry
 * the `.sp-hover-host` class. The primitive emits a one-shot dev-only
 * `console.warn` when it mounts under a host that lacks the class so the
 * ancestor invariant is surfaced during development.
 *
 *   ```html
 *   <li class="sp-hover-host">
 *     <span>{{ msg }}</span>
 *     <HoverActions placement="block-end-inline-end">
 *       <SpIconButton icon="copy" ariaLabel="Copy" />
 *     </HoverActions>
 *   </li>
 *   ```
 *
 * CSS contract — backed by tokens.css `--sp-duration-fast` / `--sp-ease`
 * (ADR-AUX-002). Reduced-motion and coarse-pointer overrides live below.
 */
import { onMounted, ref } from 'vue'

type HoverActionsPlacement =
	| 'block-end-inline-end'
	| 'block-end-inline-start'
	| 'block-start-inline-end'

interface HoverActionsProps {
	placement?: HoverActionsPlacement
	alwaysVisible?: boolean
}

withDefaults(defineProps<HoverActionsProps>(), {
	placement: 'block-end-inline-end',
	alwaysVisible: false,
})

defineOptions({ name: 'HoverActions' })

const el = ref<HTMLElement | null>(null)

onMounted(() => {
	// Dev-only ancestor check — see ADR-AUX-003 / spec §10 risk row.
	const host = el.value
	if (!host) return
	if (host.closest('.sp-hover-host') === null) {
		// eslint-disable-next-line no-console
		console.warn(
			'HoverActions: expected a `.sp-hover-host` ancestor on the row driving the reveal. ' +
				'Without it the hover/focus reveal will never fire — see ADR-AUX-003 / spec §1.3.2.',
		)
	}
})
</script>

<template>
	<div
		ref="el"
		class="sp-hover-actions"
		role="toolbar"
		:data-testid="'hover-actions'"
		:data-placement="placement"
		:data-always-visible="alwaysVisible ? 'true' : 'false'"
	>
		<slot />
	</div>
</template>

<style>
.sp-hover-actions {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-2);
	opacity: 0;
	transition: opacity var(--sp-duration-fast) var(--sp-ease);
}
.sp-hover-host:hover .sp-hover-actions,
.sp-hover-host:focus-within .sp-hover-actions,
.sp-hover-actions:focus-within {
	opacity: 1;
}
.sp-hover-actions[data-always-visible='true'] {
	opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
	.sp-hover-actions {
		transition: none;
	}
}
@media (pointer: coarse) {
	.sp-hover-actions {
		opacity: 1;
	}
}
</style>
