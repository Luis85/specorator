<script setup lang="ts">
import { computed } from 'vue';
import type { MentionReferent, MentionReferentKind } from '@/domain/ports';
import SpIcon from '@/ui/chat/SpIcon.vue';

/**
 * A single `@`-mention palette row (SPEC-CP-020, REQ-CP-009/011/013). A
 * file/folder referent renders a single-line ellipsised path; a subagent /
 * MCP-server / external-dir referent renders a two-line name + description with a
 * category-distinct icon via the P2 `<SpIcon>` seam (no raw colour — the colour
 * rides the `--sp-mention-*` token via the category modifier class). Names /
 * paths / descriptions are `{{ }}` text only — NO `v-html` (NFR-CP-003, EC-CP-13).
 */
const props = defineProps<{ referent: MentionReferent }>();

/** Two-line layout for the catalog-backed referents (subagent / MCP / dir). */
const isTwoLine = computed(
	() => props.referent.kind !== 'file' && props.referent.kind !== 'folder',
);

const ICON_BY_KIND: Record<MentionReferentKind, string> = {
	file: 'file',
	folder: 'folder-search',
	subagent: 'bot',
	'mcp-server': 'plug',
	'external-dir': 'globe',
};

const iconName = computed(() => ICON_BY_KIND[props.referent.kind]);

/** Category token modifier — `--sp-mention-file/agent/mcp/dir` (SPEC-CP-029). */
const categoryClass = computed(() => `sp-mention-row--${props.referent.kind}`);
</script>

<template>
	<span
		class="sp-mention-row"
		:class="[categoryClass, { 'sp-mention-row--two-line': isTwoLine }]"
		data-testid="mention-row"
	>
		<span class="sp-mention-row__icon" data-testid="mention-row-icon">
			<SpIcon :name="iconName" />
		</span>
		<span class="sp-mention-row__body">
			<span class="sp-mention-row__name" data-testid="mention-row-name">{{ referent.name }}</span>
			<span
				v-if="referent.detail !== undefined && referent.detail !== ''"
				class="sp-mention-row__detail"
				data-testid="mention-row-detail"
			>{{ referent.detail }}</span>
		</span>
	</span>
</template>

<style scoped>
.sp-mention-row {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	inline-size: 100%;
	min-inline-size: 0;
}

.sp-mention-row--two-line {
	align-items: flex-start;
}

.sp-mention-row__icon {
	display: inline-flex;
	flex: 0 0 auto;
	color: var(--sp-mention-file);
}

.sp-mention-row--subagent .sp-mention-row__icon {
	color: var(--sp-mention-agent);
}

.sp-mention-row--mcp-server .sp-mention-row__icon {
	color: var(--sp-mention-mcp);
}

.sp-mention-row--external-dir .sp-mention-row__icon {
	color: var(--sp-mention-dir);
}

.sp-mention-row__body {
	display: flex;
	flex-direction: column;
	min-inline-size: 0;
	gap: var(--sp-space-1);
}

.sp-mention-row__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sp-mention-row__detail {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
