<script setup lang="ts">
import ContextUsageMeter from './toolbar/ContextUsageMeter.vue';
import ExternalContextSelector from './toolbar/ExternalContextSelector.vue';
import McpServerSelector from './toolbar/McpServerSelector.vue';
import ModelSelector from './toolbar/ModelSelector.vue';
import ModeSelector from './toolbar/ModeSelector.vue';
import PermissionToggle from './toolbar/PermissionToggle.vue';
import PlanModeToggle from './toolbar/PlanModeToggle.vue';
import ServiceTierToggle from './toolbar/ServiceTierToggle.vue';
import ThinkingBudgetSelector from './toolbar/ThinkingBudgetSelector.vue';

// Widget order mirrors the imperative `createInputToolbar` build (Model,
// Thinking, ServiceTier, ContextUsage, ExternalContext, Mcp, Permission,
// PlanMode, Mode). There is NO send button — send is keyboard-only (strict
// parity). Each widget reads its own slice from the projected composer store
// and fires callbacks back through the engine seam.
</script>

<template>
  <div class="specorator-input-toolbar">
    <ModelSelector />
    <ThinkingBudgetSelector />
    <ServiceTierToggle />
    <ContextUsageMeter />
    <ExternalContextSelector />
    <McpServerSelector />
    <PermissionToggle />
    <PlanModeToggle />
    <ModeSelector />
  </div>
</template>
