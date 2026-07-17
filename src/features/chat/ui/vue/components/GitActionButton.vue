<script setup lang="ts">
import { computed, inject } from 'vue';

import { CALLBACKS_KEY } from '../chatShellKeys';
import { mountIcon } from '../mountIcon';
import { useChatShellStore } from '../stores/chatShellStore';

const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('GitActionButton mounted without CALLBACKS_KEY');
const store = useChatShellStore();

const visible = computed(() => store.git.visible);
const dirtyCount = computed(() => store.git.dirtyCount);
const changes = computed(() => `${dirtyCount.value} change${dirtyCount.value === 1 ? '' : 's'}`);
const ariaLabel = computed(() => (visible.value ? `Commit and push ${changes.value}` : 'Commit and push changes'));
const title = computed(() => `Ask the active agent to commit and push ${changes.value}.`);

function iconHost(el: unknown): void { mountIcon(el, 'git-commit-horizontal'); }
</script>

<template>
  <div
    class="specorator-git-action"
    :class="{ 'specorator-hidden': !visible }"
  >
    <button
      type="button"
      class="specorator-git-action-btn"
      :aria-label="ariaLabel"
      :title="visible ? title : undefined"
      @click.stop="cb.onGitCommit()"
    >
      <span
        :ref="iconHost"
        class="specorator-git-action-icon"
      />
      <span class="specorator-git-action-label">Commit &amp; push</span>
      <span class="specorator-git-action-badge">{{ visible ? String(dirtyCount) : '' }}</span>
    </button>
  </div>
</template>
