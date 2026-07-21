<script setup lang="ts">
import { inject } from 'vue';

import { ProviderRegistry } from '../../../../core/providers/ProviderRegistry';
import { asSettingsBag } from '../../../../core/types/settings';
import { t } from '../../../../i18n/i18n';
import { rosterRoleLabel } from '../../../agents/roster/rosterLibraryAccessors';
import type { RosterAgent } from '../../../agents/roster/rosterTypes';
import { PLUGIN_KEY } from '../libraryKeys';

const props = defineProps<{ agent: RosterAgent }>();

// Presentational, but roster-specific: the model chip resolves its label
// through the active provider's UI config, so the row reads the plugin
// directly rather than drilling a derived string through the card shell.
const plugin = inject(PLUGIN_KEY, null);

function modelLabel(agent: RosterAgent): string {
  const selection = agent.modelSelection;
  if (!selection || !plugin) return '';
  const options = ProviderRegistry.getChatUIConfig(selection.providerId)
    .getModelOptions(asSettingsBag(plugin.settings));
  return options.find((o) => o.value === selection.modelId)?.label ?? selection.modelId;
}

/** Legacy parity: an agent with no chips renders no (empty) caps row at all. */
function hasCaps(agent: RosterAgent): boolean {
  // `!= null` (not `!== undefined`): a raw `"modelSelection": null` in roster
  // JSON must not open the caps row while the chip's truthiness check skips it.
  return (
    agent.roles.length > 0 ||
    (agent.tags ?? []).length > 0 ||
    agent.modelSelection != null ||
    agent.skills.length > 0
  );
}
</script>

<template>
  <div
    v-if="hasCaps(props.agent)"
    class="specorator-vue-card-caps"
  >
    <span
      v-for="role in props.agent.roles"
      :key="role"
      class="specorator-vue-agent-chip specorator-vue-agent-chip-role"
    >
      {{ rosterRoleLabel(role) }}
    </span>
    <span
      v-for="tag in props.agent.tags ?? []"
      :key="tag"
      class="specorator-vue-chip"
    >{{ tag }}</span>
    <span
      v-if="props.agent.modelSelection"
      class="specorator-vue-agent-chip specorator-vue-agent-chip-model"
    >
      {{ modelLabel(props.agent) }}
    </span>
    <span
      v-if="props.agent.skills.length > 0"
      class="specorator-vue-agent-chip"
    >
      {{ t('agentRoster.capsSummary', { skills: String(props.agent.skills.length) }) }}
    </span>
  </div>
</template>

<style scoped>
/* Roster-specific chip deltas (forked from features/agent-roster.css; the
   legacy roster view was deleted 2026-07-04). */
.specorator-vue-agent-chip {
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-muted);
  background: var(--sp-border);
  border-radius: var(--sp-radius-s);
  padding: 0 var(--sp-space-2xs);
}

.specorator-vue-agent-chip-role {
  color: var(--sp-text-on-accent);
  background: var(--sp-accent);
}
</style>
