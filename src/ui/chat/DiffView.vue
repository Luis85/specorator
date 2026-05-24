<script setup lang="ts">
import { computed } from 'vue';
import type { DiffLine, ToolDiffData } from '@/domain/chat/diff/Diff';
import { splitDiffHunks } from '@/application/chat/splitDiffHunks';

/**
 * Renders a Write/Edit diff as per-line declarative spans (SPEC-RR-029). Each
 * `DiffLine` is a 16px centred monospace prefix gutter (`+`/`−`/space, via the
 * `--sp-diff-gutter` token) and a text span — `line.text || ' '` so an empty
 * line still occupies a row (parity `DiffRenderer.ts:131`). Line background
 * rides a per-type class over `--sp-diff-insert-bg`/`--sp-diff-delete-bg` (equal
 * is muted): BACKGROUND-HIGHLIGHT ONLY, never `text-decoration`/strikethrough
 * (the explicit `diff.css` rule, REQ-RR-025). The body scrolls within
 * `--sp-diff-max-height`.
 *
 * Hunking (R-RR-004): a mixed diff is split into hunks of ±3 equal-context lines
 * around each change (`splitDiffHunks`, parity `DiffRenderer.ts:23-102`), with a
 * `...` separator row between hunks — the distant equal body is elided rather
 * than rendered flat. An ALL-INSERT new file longer than `NEW_FILE_DISPLAY_CAP`
 * (20, reproduced from `DiffRenderer.ts:76` — not newly invented, NFR-RR-013)
 * keeps the cap path: first 20 lines + a "... N more lines" footer (EC-RR-5).
 * Text via `{{ }}` declarative spans — NO `v-html` (NFR-RR-006).
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

const cappedLines = computed<DiffLine[]>(() =>
	props.diffData.diffLines.slice(0, NEW_FILE_DISPLAY_CAP),
);

const hiddenCount = computed(() =>
	isCapped.value ? props.diffData.diffLines.length - NEW_FILE_DISPLAY_CAP : 0,
);

/** Hunks of ±3 equal-context lines around each change (only when not in the cap path). */
const hunks = computed(() =>
	isCapped.value ? [] : splitDiffHunks(props.diffData.diffLines, 3),
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
		<!-- All-insert new file: capped flat list + "... N more lines" footer (EC-RR-5). -->
		<template v-if="isCapped">
			<div
				v-for="(line, index) in cappedLines"
				:key="index"
				class="sp-diff__line"
				:class="`sp-diff__line--${line.type}`"
				:data-line-type="line.type"
				data-testid="diff-line"
			>
				<span class="sp-diff__gutter" data-testid="diff-line-gutter" aria-hidden="true">{{
					gutter(line.type)
				}}</span>
				<span class="sp-diff__text" data-testid="diff-line-text" dir="auto">{{
					line.text || ' '
				}}</span>
			</div>
			<div v-if="hiddenCount > 0" class="sp-diff__more" data-testid="diff-more">
				... {{ hiddenCount }} more lines
			</div>
		</template>

		<!-- Mixed diff: hunks with a "..." separator between them (R-RR-004). -->
		<template v-for="(hunk, hunkIndex) in hunks" v-else :key="hunkIndex">
			<div
				v-if="hunkIndex > 0"
				class="sp-diff__separator"
				data-testid="diff-separator"
				aria-hidden="true"
			>
				...
			</div>
			<div
				v-for="(line, index) in hunk.lines"
				:key="`${hunkIndex}-${index}`"
				class="sp-diff__line"
				:class="`sp-diff__line--${line.type}`"
				:data-line-type="line.type"
				data-testid="diff-line"
			>
				<span class="sp-diff__gutter" data-testid="diff-line-gutter" aria-hidden="true">{{
					gutter(line.type)
				}}</span>
				<span class="sp-diff__text" data-testid="diff-line-text" dir="auto">{{
					line.text || ' '
				}}</span>
			</div>
		</template>
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

.sp-diff__separator {
	color: var(--sp-text-muted);
	user-select: none;
	padding-inline-start: var(--sp-diff-gutter);
}
</style>
