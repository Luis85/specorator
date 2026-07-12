<script setup lang="ts">
import { computed } from 'vue';

import type { ToolDiffData } from '../../../../../../core/types';
import type { DiffLine } from '../../../../../../core/types/diff';
import { splitIntoHunks } from '../../../../rendering/DiffRenderer';

/**
 * Reproduces `rendering/DiffRenderer.ts`'s two pure render functions —
 * `renderDiffStats` and `renderDiffContent` — as a single reusable component
 * driven by `ToolCallInfo.diffData`. `splitIntoHunks` (pure) is reused
 * directly rather than reimplemented.
 *
 * Two independent DOM shapes share one component so both call sites
 * (`WriteEditView.vue`'s header stats cell + diff-row body, and
 * `ToolContentLines.vue`'s per-file apply_patch sections) can each mount
 * exactly the fragment they need:
 * - `part="stats"` (default when omitted by neither caller — always passed
 *   explicitly): a bare `+N`/`-N` span fragment (no wrapper element),
 *   matching `renderDiffStats(statsEl, stats)` writing directly into an
 *   already-existing host element owned by the caller.
 * - `part="diff"`: the `.specorator-write-edit-diff` host div itself,
 *   matching `renderDiffContent(diffEl, diffLines)` where `diffEl` is the
 *   `.specorator-write-edit-diff` div passed in by the caller.
 */
const props = withDefaults(defineProps<{ diffData: ToolDiffData; part?: 'diff' | 'stats' }>(), {
  part: 'diff',
});

/** Max lines to render for all-inserts diffs (new file creation). Mirrors DiffRenderer.ts. */
const NEW_FILE_DISPLAY_CAP = 20;

interface RenderLine {
  type: DiffLine['type'];
  prefix: string;
  text: string;
}

type RenderBlock =
  | { kind: 'hunk'; lines: RenderLine[] }
  | { kind: 'separator'; text: string }
  | { kind: 'no-changes' };

function toRenderLine(line: DiffLine, forcedType?: DiffLine['type']): RenderLine {
  const type = forcedType ?? line.type;
  const prefix = type === 'insert' ? '+' : type === 'delete' ? '-' : ' ';
  return { type, prefix, text: line.text || ' ' };
}

const blocks = computed<RenderBlock[]>(() => {
  const diffLines = props.diffData.diffLines;

  const allInserts = diffLines.length > 0 && diffLines.every(line => line.type === 'insert');
  if (allInserts && diffLines.length > NEW_FILE_DISPLAY_CAP) {
    const capped = diffLines.slice(0, NEW_FILE_DISPLAY_CAP);
    const remaining = diffLines.length - NEW_FILE_DISPLAY_CAP;
    return [
      { kind: 'hunk', lines: capped.map(line => toRenderLine(line, 'insert')) },
      { kind: 'separator', text: `... ${remaining} more lines` },
    ];
  }

  const hunks = splitIntoHunks(diffLines);
  if (hunks.length === 0) return [{ kind: 'no-changes' }];

  const result: RenderBlock[] = [];
  hunks.forEach((hunk, index) => {
    if (index > 0) result.push({ kind: 'separator', text: '...' });
    result.push({ kind: 'hunk', lines: hunk.lines.map(line => toRenderLine(line)) });
  });
  return result;
});

interface StatsSegment {
  cls: 'added' | 'removed' | null;
  text: string;
}

const statsSegments = computed<StatsSegment[]>(() => {
  const { added, removed } = props.diffData.stats;
  const segments: StatsSegment[] = [];
  if (added > 0) segments.push({ cls: 'added', text: `+${added}` });
  if (removed > 0) {
    if (added > 0) segments.push({ cls: null, text: ' ' });
    segments.push({ cls: 'removed', text: `-${removed}` });
  }
  return segments;
});
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <template v-if="part === 'stats'">
    <span
      v-for="(segment, i) in statsSegments"
      :key="i"
      :class="segment.cls"
    >{{ segment.text }}</span>
  </template>
  <div
    v-else
    class="specorator-write-edit-diff"
  >
    <template
      v-for="(block, i) in blocks"
      :key="i"
    >
      <div
        v-if="block.kind === 'hunk'"
        class="specorator-diff-hunk"
      >
        <div
          v-for="(line, j) in block.lines"
          :key="j"
          :class="`specorator-diff-line specorator-diff-${line.type}`"
        >
          <span class="specorator-diff-prefix">{{ line.prefix }}</span><span class="specorator-diff-text">{{ line.text }}</span>
        </div>
      </div>
      <div
        v-else-if="block.kind === 'separator'"
        class="specorator-diff-separator"
      >{{ block.text }}</div>
      <div
        v-else
        class="specorator-diff-no-changes"
      >No changes</div>
    </template>
  </div>
</template>
