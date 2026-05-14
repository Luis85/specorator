<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsPort } from '@/ui/composables/useSettingsPort'
import { useVaultPort } from '@/ui/composables/useVaultPort'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'
import { tryAsync } from '@/domain/shared/tryAsync'

type TemplateStatus = 'installed' | 'skipped' | 'failed'
type WorkspaceStatus = 'checking' | 'ready' | 'not-installed' | 'error'

const props = defineProps<{ initialSpecsFolder: string }>()
const emit = defineEmits<{ next: [payload: { templateStatus: TemplateStatus; specsFolder: string }] }>()

const settingsPort = useSettingsPort()
const vaultPort = useVaultPort()
const logger = useLoggerPort()

const specsFolder = ref(props.initialSpecsFolder)
const workspaceStatus = ref<WorkspaceStatus>('checking')
const isInstalling = ref(false)
const installOutcome = ref<'success' | 'failure' | null>(null)
const folderEmpty = ref(false)

onMounted(async () => {
	const folder = specsFolder.value.trim()
	const parentPath = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : ''
	const folderName = folder.includes('/') ? folder.slice(folder.lastIndexOf('/') + 1) : folder
	const result = await tryAsync(() => vaultPort.listFolders(parentPath))
	if (result.ok && result.value.includes(folderName)) {
		workspaceStatus.value = 'ready'
	} else {
		if (!result.ok) logger.error('Failed to check workspace status', result.error)
		workspaceStatus.value = 'not-installed'
	}
})

function validateFolder(): void {
	folderEmpty.value = specsFolder.value.trim() === ''
}

async function saveFolder(): Promise<void> {
	const current = await settingsPort.getSettings()
	await settingsPort.saveSettings({ ...current, specsFolder: specsFolder.value.trim() })
}

async function install(): Promise<void> {
	if (folderEmpty.value) return
	isInstalling.value = true
	installOutcome.value = null
	const result = await tryAsync(async () => {
		await saveFolder()
		// Create the specs folder if it doesn't exist
		await vaultPort.createFolder(specsFolder.value.trim())
	})
	if (result.ok) {
		workspaceStatus.value = 'ready'
		installOutcome.value = 'success'
		// Auto-advance after a short pause
		await new Promise<void>((resolve) => { window.setTimeout(resolve, 1500) })
		emit('next', { templateStatus: 'installed', specsFolder: specsFolder.value.trim() })
	} else {
		logger.error('Failed to install workspace', result.error)
		installOutcome.value = 'failure'
	}
	isInstalling.value = false
}

async function skip(): Promise<void> {
	const folder = specsFolder.value.trim()
	if (folder && folder !== props.initialSpecsFolder) {
		await tryAsync(() => saveFolder())
	}
	emit('next', { templateStatus: 'skipped', specsFolder: folder || props.initialSpecsFolder })
}
</script>

<template>
	<div class="sp-onboarding__step" data-testid="step4">
		<h2 class="sp-onboarding__heading">Set up your workspace.</h2>
		<p class="sp-onboarding__body">
			Specorator uses a folder in your vault to store your feature files. The default works well for
			most people — you can change it at any time from settings.
		</p>

		<div class="sp-onboarding__field-row">
			<label for="ob-specs-folder">Where should features be stored?</label>
			<input
				id="ob-specs-folder"
				v-model="specsFolder"
				type="text"
				class="sp-onboarding__input"
				:readonly="isInstalling"
				data-testid="step4-specs-folder-input"
				@input="validateFolder"
			/>
			<p v-if="folderEmpty" class="sp-onboarding__field-hint" data-testid="step4-field-hint">
				Enter a folder name for your features.
			</p>
		</div>

		<div class="sp-onboarding__status-region" data-testid="step4-status-paragraph">
			<template v-if="workspaceStatus === 'checking'">Checking your workspace…</template>
			<template v-else-if="workspaceStatus === 'ready'">Your workflow templates are already set up.</template>
			<template v-else-if="workspaceStatus === 'not-installed'">Workflow templates are not yet installed.</template>
			<template v-else>We couldn't check your workspace status. You can install templates or continue.</template>
		</div>

		<p
			v-if="installOutcome === 'success'"
			role="status"
			aria-live="polite"
			class="sp-onboarding__outcome sp-onboarding__outcome--success"
			data-testid="step4-outcome"
		>
			Your workspace is ready.
		</p>
		<p
			v-if="installOutcome === 'failure'"
			role="alert"
			aria-live="assertive"
			class="sp-onboarding__outcome sp-onboarding__outcome--error"
			data-testid="step4-outcome"
		>
			Some templates couldn't be installed. You can try again or continue — you can always install later from settings.
		</p>

		<div v-if="workspaceStatus !== 'checking'" class="sp-onboarding__actions">
			<button
				class="sp-btn sp-btn--primary sp-btn--md"
				:aria-label="isInstalling ? 'Installing, please wait' : (workspaceStatus === 'ready' ? 'Reinstall' : (installOutcome === 'failure' ? 'Try again' : 'Install'))"
				:disabled="isInstalling || folderEmpty"
				data-testid="step4-install-btn"
				@click="install"
			>
				{{ isInstalling ? 'Installing…' : (workspaceStatus === 'ready' ? 'Reinstall' : (installOutcome === 'failure' ? 'Try again' : 'Install')) }}
			</button>
			<button
				class="sp-onboarding__skip"
				:disabled="isInstalling"
				data-testid="step4-skip-btn"
				@click="skip"
			>
				Skip for now
			</button>
		</div>
	</div>
</template>

<style scoped>
.sp-onboarding__field-row {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.sp-onboarding__input {
	padding: 0.375rem 0.625rem;
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	background: var(--background-primary);
	color: var(--text-normal);
	font-size: 0.9375rem;
}

.sp-onboarding__field-hint {
	font-size: 0.8125rem;
	color: var(--text-error);
	margin: 0;
}

.sp-onboarding__outcome {
	font-size: 0.875rem;
	margin: 0;
}

.sp-onboarding__outcome--success {
	color: var(--text-success, #4ade80);
}

.sp-onboarding__outcome--error {
	color: var(--text-error);
}

.sp-onboarding__actions {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	align-items: flex-start;
}

.sp-onboarding__skip {
	background: none;
	border: none;
	padding: 0;
	cursor: pointer;
	color: var(--text-muted);
	font-size: 0.875rem;
	min-width: 24px;
	min-height: 24px;
}

.sp-onboarding__skip:disabled {
	opacity: 0.5;
	cursor: default;
}
</style>
