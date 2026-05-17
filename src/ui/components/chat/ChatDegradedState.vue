<script setup lang="ts">
/**
 * Renders the four degraded-state branches the chat surface can fall into.
 * Extracted from `ChatSidebar.vue` during WP-2 so the main component focuses
 * on the orchestrator dispatch + ready-state template.
 *
 * The variants:
 *   - `mobile` — Obsidian on iOS / Android.
 *   - `cli-missing` — subscription transport but the CLI binary is not
 *     installed locally. Independent of API-key state (Codex P2, PR #347).
 *   - `api-key-missing` — api-key transport but the secret is empty. Surfaces
 *     the `openPluginSettings` CTA so the user can fix it.
 *   - `sdk-unavailable` — generic fallback when neither `mobile` nor the
 *     transport-specific conditions explain why availability is false.
 *
 * Purely presentational: receives props, emits one event (`open-settings`).
 */
defineProps<{
	variant: 'mobile' | 'cli-missing' | 'api-key-missing' | 'sdk-unavailable';
}>();

defineEmits<{
	'open-settings': [];
}>();
</script>

<template>
	<div class="sp-chat__degraded">
		<template v-if="variant === 'mobile'">
			<h3 class="sp-chat__degraded-heading" tabindex="-1" data-testid="chat-degraded-heading">
				Chat is available on desktop only.
			</h3>
			<p class="sp-chat__degraded-body">
				Open Obsidian on your Mac, Windows, or Linux computer to use the AI assistant.
			</p>
		</template>

		<!--
      Subscription-transport CLI missing (Codex P2, PR #347). When the user
      has selected the subscription transport, the API key is irrelevant —
      availability depends on the locally-installed `claude` binary. Show
      CLI-install guidance instead of the (useless) API-key copy, even if
      `apiKeyMissing` happens to be true.
    -->
		<template v-else-if="variant === 'cli-missing'">
			<h3 class="sp-chat__degraded-heading" tabindex="-1" data-testid="chat-degraded-heading">
				Claude CLI is not available.
			</h3>
			<p class="sp-chat__degraded-body">
				The subscription transport needs the Claude CLI installed locally. Install Claude Code on
				this device, then reopen this view.
			</p>
		</template>

		<!-- API key missing degraded state (REQ-CCS-018) — api-key transport only. -->
		<template v-else-if="variant === 'api-key-missing'">
			<h3 class="sp-chat__degraded-heading" tabindex="-1" data-testid="chat-degraded-heading">
				Chat is not set up yet.
			</h3>
			<p class="sp-chat__degraded-body">
				To use this feature, add your Anthropic key in Settings. Your key is stored privately on
				this device and is never shared.
			</p>
			<button
				type="button"
				class="sp-btn sp-btn--secondary sp-btn--md"
				data-testid="chat-degraded-settings-link"
				@click="$emit('open-settings')"
			>
				Open settings
			</button>
		</template>

		<!-- SDK unavailable degraded state (REQ-CCS-019) -->
		<template v-else>
			<h3 class="sp-chat__degraded-heading" tabindex="-1" data-testid="chat-degraded-heading">
				AI assistant is not available right now.
			</h3>
			<p class="sp-chat__degraded-body">
				The AI assistant could not start. This may be a temporary issue. If the problem continues,
				try restarting Obsidian.
			</p>
		</template>
	</div>
</template>

<style scoped>
.sp-chat__degraded {
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 8px;
	padding: 1rem;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.sp-chat__degraded-heading {
	margin: 0;
	font-size: 1rem;
	font-weight: 600;
	color: var(--text-normal);
}

.sp-chat__degraded-body {
	margin: 0;
	font-size: 0.875rem;
	color: var(--text-muted);
}
</style>
