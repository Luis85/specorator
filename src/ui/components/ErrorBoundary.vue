<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'
import { useNotificationPort } from '@/ui/composables/useNotificationPort'

const isDev = import.meta.env.DEV
const error = ref<Error | null>(null)
const log = useLoggerPort()
const notify = useNotificationPort()

onErrorCaptured((err) => {
	const asError = err instanceof Error ? err : new Error(String(err))
	error.value = asError
	log.error('[ErrorBoundary] Unhandled component error', err)
	notify.showError('Something went wrong. Please reload the view.')
	return false
})
</script>

<template>
	<slot v-if="!error" />
	<div v-else class="sp-error-boundary" data-testid="error-boundary-fallback">
		<p>Something went wrong. Please reload the view.</p>
		<pre v-if="isDev">{{ error.message }}</pre>
	</div>
</template>
