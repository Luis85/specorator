<script setup lang="ts">
import type { ToolbarViewModel } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { ReasoningChoice } from '@/domain/chat/Reasoning';
import type { NotificationPort } from '@/domain/ports';
import ModelSelector from './ModelSelector.vue';
import ModeSelector from './ModeSelector.vue';
import PermissionToggle from './PermissionToggle.vue';
import ThinkingSelector from './ThinkingSelector.vue';
import ServiceTierToggle from './ServiceTierToggle.vue';
import McpSelector from './McpSelector.vue';
import ExternalContextControl from './ExternalContextControl.vue';
import UsageMeter from './UsageMeter.vue';

/**
 * The toolbar strip container (SPEC-TC-012, REQ-TC-001/003). The ONLY
 * capability/view-model reader — it receives the prebuilt `ToolbarViewModel` (from
 * `buildToolbarViewModel`, computed by `ChatSurface`) and lays the leaf widgets in
 * Claudian order: model · mode · permission · thinking · service-tier · MCP ·
 * external grouped leading, the usage meter pinned trailing (DESIGN-TC-001 A.1).
 * Each leaf renders ONLY per its `vm.<widget>.visibility.kind === 'visible'` — a
 * hidden widget's slot collapses (no dead button, REQ-TC-019/021). The four backed
 * widget changes are re-emitted up to `ChatSurface` (which owns the per-tab control
 * state, ADR-TC-001). At 320 px the row `flex-wrap`s with the meter dropping to the
 * trailing end of the wrapped row (NFR-TC-008). No `obsidian`/`v-html`. Claudian
 * ground-truth: `InputToolbar.ts` (`.claudian-input-toolbar`).
 */
defineProps<{ vm: ToolbarViewModel; notify?: NotificationPort }>();
const emit = defineEmits<{
	'pick-model': [id: string];
	'set-mode': [value: string];
	'set-reasoning': [choice: ReasoningChoice];
	'toggle-service-tier': [active: boolean];
}>();
</script>

<template>
	<div class="sp-toolbar-strip" data-testid="toolbar-strip" role="toolbar">
		<div class="sp-toolbar-strip__group">
			<ModelSelector
				v-if="vm.model.visibility.kind === 'visible'"
				:vm="vm.model"
				@pick="emit('pick-model', $event)"
			/>
			<ModeSelector
				v-if="vm.mode.visibility.kind === 'visible'"
				:vm="vm.mode"
				@set="emit('set-mode', $event)"
			/>
			<PermissionToggle
				v-if="vm.permission.visibility.kind === 'visible'"
				:vm="vm.permission"
				:notify="notify"
			/>
			<ThinkingSelector
				v-if="vm.thinking.visibility.kind === 'visible'"
				:vm="vm.thinking"
				@set="emit('set-reasoning', $event)"
			/>
			<ServiceTierToggle
				v-if="vm.serviceTier.visibility.kind === 'visible'"
				:vm="vm.serviceTier"
				@toggle="emit('toggle-service-tier', $event)"
			/>
			<McpSelector v-if="vm.mcp.visibility.kind === 'visible'" :vm="vm.mcp" />
			<ExternalContextControl
				v-if="vm.external.visibility.kind === 'visible'"
				:vm="vm.external"
				:notify="notify"
			/>
		</div>
		<UsageMeter v-if="vm.usage.visibility.kind === 'visible'" class="sp-toolbar-strip__meter" :vm="vm.usage" />
	</div>
</template>

<style scoped>
.sp-toolbar-strip {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: var(--sp-toolbar-gap);
}

.sp-toolbar-strip__group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--sp-toolbar-gap);
}

.sp-toolbar-strip__meter {
	margin-inline-start: auto;
}
</style>
