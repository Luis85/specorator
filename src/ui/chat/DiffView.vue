<script setup lang="ts">
import { computed } from 'vue';
import type { DiffLine, ToolDiffData } from '@/domain/chat/diff/Diff';

/**
 * Renders a Write/Edit diff as per-line declarative spans (SPEC-RR-029). Each
 * `DiffLine` is a 16px centred monospace prefix gutter (`+`/`−`/space, via the
 * `--sp-diff-gutter` token) and a text span — `line.text || ' '` so an empty
 * line still occupies a row (parity `DiffRenderer.ts:131`). Line background
 * rides a per-type class over `--sp-diff-insert-bg`/`--sp-diff-delete-bg` (equal
 * is muted): BACKGROUND-HIGHLIGHT ONLY, never `text-decoration`/strikethrough
 * (the explicit `diff.css` rule, REQ-RR-025). The body scrolls within
 * `--sp-diff-max-height`. An ALL-INSERT new file longer than
 * `NEW_FILE_DISPLAY_CAP` (20, reproduced from `DiffRenderer.ts:76` — not newly
 * invented, NFR-RR-013) shows the first 20 lines + a "... N more lines" footer
 * (EC-RR-5). Text via `{{ }}` declarative spans — NO `v-html` (NFR-RR-006).
 */
const props = defineProps<{ diffData: ToolDiffData }>();

/** Parity `DiffRenderer.ts:76` — cap all-insert new-file diffs at 20 displayed lines. */
const NEW_FILE_DISPLAY_CAP = 20;

const allInsert = computed(
	() => props.diffData.diffLines.length > 0 && props.diffData.diffLines.every((l) => l.type === 'insert'),
);

const isCapped = computed(
	() => allInsert.value && props.diffData.diffLines.length > NEW_FILE_DISPLAY_CAP,
);

const visibleLines = computed<DiffLine[]>(() =>
	isCapped.value ? props.diffData.diffLines.slice(0, NEW_FILE_DISPLAY_CAP) : props.diffData.diffLines,
);

const hiddenCount = computed(() =>
	isCapped.value ? props.diffData.diffLines.length - NEW_FILE_DISPLAY_CAP : 0,
);

/** Gutter glyph per line type: `+` insert, `−` delete, space for equal. */
function gutter(type: DiffLine['type']): string {
	if (type === 'insert') return '+';
	if (type === 'delete') return '−';
	return ' ';
}
</script>

<template>
	<div class="sp-diff" data-testid="diff-view">
		<div
			v-for="(line, index) in visibleLines"
			:key="index"
			class="sp-diff__line"
			:class="`sp-diff__line--${line.type}`"
			:data-line-type="line.type"
			data-testid="diff-line"
		>
			<span class="sp-diff__gutter" data-testid="diff-line-gutter" aria-hidden="true">{{
				gutter(line.type)
			}}</span>
			<span class="sp-diff__text" data-testid="diff-line-text" dir="auto">{{ line.text || ' ' }}</span>
		</div>
		<div v-if="hiddenCount > 0" class="sp-diff__more" data-testid="diff-more">
			... {{ hiddenCount }} more lines
		</div>
	</div>
</template>

<style scoped>
.sp-diff {
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
	max-block-size: var(--sp-diff-max-height);
	overflow: auto;
}

.sp-diff__line {
	display: flex;
	align-items: flex-start;
	gap: var(--sp-space-2);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.sp-diff__gutter {
	flex: 0 0 var(--sp-diff-gutter);
	inline-size: var(--sp-diff-gutter);
	text-align: center;
	user-select: none;
}

.sp-diff__text {
	flex: 1 1 auto;
	unicode-bidi: plaintext;
}

.sp-diff__line--insert {
	background: var(--sp-diff-insert-bg);
}

.sp-diff__line--delete {
	background: var(--sp-diff-delete-bg);
}

.sp-diff__line--equal {
	color: var(--sp-text-muted);
}

.sp-diff__more {
	color: var(--sp-text-muted);
	font-style: italic;
	margin-block-start: var(--sp-space-1);
}
</style>
