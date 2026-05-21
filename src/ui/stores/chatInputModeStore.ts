import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Pinia store for ChatInput's modeline flags:
 *
 * - `planMode` — toggled by `Shift+Tab`. Independent from prefix detection.
 *   Forwarded into the transport as `--permission-mode plan` (REQ-MPS-036,
 *   REQ-MPS-037).
 * - `bangBashMode` — true when the draft starts with `!`. The draft is sent
 *   verbatim (no OS dispatch — see NG7). REQ-MPS-038, TST-MPS-24.
 * - `instructionMode` — true when the draft starts with `#`. The body after
 *   the `#` is routed into `ChatTransportStreamOptions.systemPromptSuffix`.
 *   REQ-MPS-039.
 *
 * Prefix detection is mutually exclusive between bang-bash and instruction;
 * plan mode composes with either.
 */
export const useChatInputModeStore = defineStore('chatInputMode', () => {
	const planMode = ref<boolean>(false);
	const bangBashMode = ref<boolean>(false);
	const instructionMode = ref<boolean>(false);

	function togglePlanMode(): void {
		planMode.value = !planMode.value;
	}

	function setFromDraft(text: string): void {
		if (text.startsWith('!')) {
			bangBashMode.value = true;
			instructionMode.value = false;
			return;
		}
		if (text.startsWith('#')) {
			instructionMode.value = true;
			bangBashMode.value = false;
			return;
		}
		bangBashMode.value = false;
		instructionMode.value = false;
	}

	function reset(): void {
		planMode.value = false;
		bangBashMode.value = false;
		instructionMode.value = false;
	}

	return {
		planMode,
		bangBashMode,
		instructionMode,
		togglePlanMode,
		setFromDraft,
		reset,
	};
});
