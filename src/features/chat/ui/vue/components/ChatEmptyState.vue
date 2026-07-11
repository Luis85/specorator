<script setup lang="ts">
import { inject } from 'vue';

import { CALLBACKS_KEY } from '../chatShellKeys';

const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('ChatEmptyState mounted without CALLBACKS_KEY');
</script>

<template>
  <div class="specorator-empty-state">
    <h3 class="specorator-empty-state-title">
      Welcome to Specorator
    </h3>
    <p class="specorator-empty-state-message">
      Specorator runs a coding-agent CLI inside Obsidian — your vault is its workspace. Set up one provider to get started:
    </p>
    <ol class="specorator-empty-state-steps">
      <li>Open settings → Specorator → general and enable a provider (Claude Code, Cursor, Codex, or OpenCode).</li>
      <li>In that provider's settings tab, set the path to its CLI (install the CLI first if you haven't).</li>
      <li>Come back here and start chatting.</li>
    </ol>
    <button
      class="specorator-empty-state-button mod-cta"
      @click="cb.onOpenSettings()"
    >
      Open settings
    </button>
  </div>
</template>
