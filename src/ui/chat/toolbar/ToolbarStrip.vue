<script setup lang="ts">
import { computed } from 'vue';
import type { ToolbarViewModel } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { McpViewModel } from '@/application/chat/mcp/buildMcpViewModel';
import type { ReasoningChoice } from '@/domain/chat/Reasoning';
import type { NotificationPort } from '@/domain/ports';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
import type { ProviderId } from '@/domain/chat/ProviderId';
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
const props = defineProps<{
	vm: ToolbarViewModel;
	notify?: NotificationPort;
	permissionMode?: PermissionMode;
	/**
	 * P8 (SPEC-MC-020): the manager-driven MCP view-model from the surface. When present
	 * the expanded `McpSelector` lists the live servers + their enabled toggles; when
	 * absent the strip falls back to the P6 visible-empty seam (the strip has no
	 * `McpServerManager` of its own, EC-MC-1).
	 */
	mcpVm?: McpViewModel;
	/**
	 * P9 (SPEC-PV-017): the resolved ACTIVE provider, threaded to `ModelSelector` so
	 * it renders the per-provider picker shape (e.g. `opencode-model-picker`). Optional
	 * + additive — absent ⇒ byte-identical P6/P8 (NFR-PV-001). NEVER branched on here
	 * (the widgets read the capability bag; the picker variant is a data-driven map).
	 */
	providerId?: ProviderId;
}>();
const emit = defineEmits<{
	'pick-model': [id: string];
	'set-mode': [value: string];
	'set-reasoning': [choice: ReasoningChoice];
	'toggle-service-tier': [active: boolean];
	/** P7 (SPEC-AS-012): the live permission-mode change re-emitted to the surface. */
	'set-permission': [mode: PermissionMode];
	/** P8 (SPEC-MC-018): the MCP selector's per-server enabled toggle re-emitted to the surface. */
	'set-mcp-enabled': [name: string, enabled: boolean];
}>();

/**
 * The `McpViewModel` the expanded `McpSelector` consumes (SPEC-MC-018). When the
 * surface threads its manager-driven `mcpVm` (≥ 1 server possible) the selector lists
 * the live servers; otherwise the strip yields the P6 visible-empty seam
 * (`empty-seam`) so a no-MCP-store mount stays byte-identical to P6. `supported` for the
 * fallback mirrors the P6 `supportsMcpTools` gate (the `visible` visibility kind).
 */
const resolvedMcpVm = computed<McpViewModel>(
	() =>
		props.mcpVm ?? {
			kind: 'empty-seam',
			servers: [],
			enabledCount: 0,
			supported: props.vm.mcp.visibility.kind === 'visible',
		},
);
</script>

<template>
	<div class="sp-toolbar-strip" data-testid="toolbar-strip" role="toolbar">
		<div class="sp-toolbar-strip__group">
			<ModelSelector
				v-if="vm.model.visibility.kind === 'visible'"
				:vm="vm.model"
				:provider-id="providerId"
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
				:mode="permissionMode"
				@set="emit('set-permission', $event)"
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
			<McpSelector
				v-if="vm.mcp.visibility.kind === 'visible'"
				:vm="resolvedMcpVm"
				@set-enabled="(name, enabled) => emit('set-mcp-enabled', name, enabled)"
			/>
			<ExternalContextControl
				v-if="vm.external.visibility.kind === 'visible'"
				:vm="vm.external"
				:notify="notify"
			/>
		</div>
		<UsageMeter
			v-if="vm.usage.visibility.kind === 'visible'"
			class="sp-toolbar-strip__meter"
			:vm="vm.usage"
		/>
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
