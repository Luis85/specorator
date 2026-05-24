<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '@/domain/ports';
import type { ContentBlock } from '@/domain/chat/ContentBlock';
import type { ToolCall } from '@/domain/chat/ToolCall';
import type { SubagentInfo } from '@/domain/chat/Subagent';
import MarkdownBlock from './MarkdownBlock.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import ToolCallBlock from './ToolCallBlock.vue';
import WriteEditBlock from './WriteEditBlock.vue';
import SubagentBlock from './SubagentBlock.vue';
import ContextCompactedBlock from './ContextCompactedBlock.vue';

/**
 * The thin ordered dispatcher (SPEC-RR-022) — it owns ordering and nothing else.
 * Iterates `message.contentBlocks` IN ORDER (`v-for` keyed by index, REQ-RR-011)
 * and renders one child per `block.type`:
 * - `text` → the P1 `MarkdownBlock` (the P1 surface never regresses);
 * - `thinking` → `ThinkingBlock`;
 * - `tool_use` → resolve `message.toolCalls.find(t => t.id === toolId)`; a
 *   Write/Edit tool routes to `WriteEditBlock`, every other tool to
 *   `ToolCallBlock` (TodoWrite renders `TodoList` inside its body). A dangling
 *   reference (no matching `ToolCall`) renders NOTHING (EC-RR-1);
 * - `subagent` → `SubagentBlock` (resolving the `SubagentInfo` by `subagentId`);
 * - `context_compacted` → `ContextCompactedBlock`.
 * Declarative only — no `v-html` (NFR-RR-006). Mirrors claudian-main
 * `MessageRenderer.renderContentBlocks`.
 */
const props = defineProps<{ message: ChatMessage }>();

/** Tools that route to the diff renderer (parity SPEC-RR-022). */
const DIFF_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit']);

/** Resolve the `ToolCall` a `tool_use` block references (EC-RR-1: undefined when dangling). */
function resolveTool(toolId: string): ToolCall | undefined {
	return props.message.toolCalls?.find((t) => t.id === toolId);
}

/** Resolve the `SubagentInfo` a `subagent` block references (across the tool calls). */
function resolveSubagent(subagentId: string): SubagentInfo | undefined {
	return props.message.toolCalls?.find((t) => t.subagent?.id === subagentId)?.subagent;
}

interface RenderItem {
	key: number;
	block: ContentBlock;
	toolCall?: ToolCall;
	subagent?: SubagentInfo;
}

/**
 * The ordered, render-resolved items. A `tool_use` with no matching `ToolCall`
 * and a `subagent` with no matching `SubagentInfo` are DROPPED (EC-RR-1), so the
 * dispatcher emits no empty wrapper for a dangling reference.
 */
const items = computed<RenderItem[]>(() => {
	const blocks = props.message.contentBlocks ?? [];
	const out: RenderItem[] = [];
	blocks.forEach((block, index) => {
		if (block.type === 'tool_use') {
			const toolCall = resolveTool(block.toolId);
			if (toolCall === undefined) return;
			out.push({ key: index, block, toolCall });
		} else if (block.type === 'subagent') {
			const subagent = resolveSubagent(block.subagentId);
			if (subagent === undefined) return;
			out.push({ key: index, block, subagent });
		} else {
			out.push({ key: index, block });
		}
	});
	return out;
});

/** Write/Edit tools render the diff view; every other tool the generic block. */
function isDiffTool(toolCall: ToolCall): boolean {
	return DIFF_TOOLS.has(toolCall.name);
}
</script>

<template>
	<div class="sp-message-blocks" data-testid="message-blocks">
		<div
			v-for="item in items"
			:key="item.key"
			class="sp-message-blocks__item"
			:data-block-kind="item.block.type"
			data-testid="message-block"
		>
			<MarkdownBlock v-if="item.block.type === 'text'" :content="item.block.content" />
			<ThinkingBlock
				v-else-if="item.block.type === 'thinking'"
				:block="item.block"
				:live="false"
			/>
			<template v-else-if="item.block.type === 'tool_use' && item.toolCall">
				<WriteEditBlock v-if="isDiffTool(item.toolCall)" :tool-call="item.toolCall" />
				<ToolCallBlock v-else :tool-call="item.toolCall" />
			</template>
			<SubagentBlock
				v-else-if="item.block.type === 'subagent' && item.subagent"
				:subagent="item.subagent"
			/>
			<ContextCompactedBlock v-else-if="item.block.type === 'context_compacted'" />
		</div>
	</div>
</template>

<style scoped>
.sp-message-blocks {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
}
</style>
