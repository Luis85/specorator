import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * `mcpStatusStore` — surfaces whether at least one MCP (Model Context Protocol)
 * tool/server is currently active for the running provider. Drives
 * `<McpIndicator>` glow animation.
 *
 * The store is intentionally minimal — full MCP plumbing lives in a later
 * workstream. For WS-AUX-6 we only need a setter the engine can call.
 *
 * REQ-AUX-004, SPEC-AUX-001 §1.3 (McpIndicator).
 */
export const useMcpStatusStore = defineStore('mcpStatus', () => {
	const active = ref<boolean>(false);
	/** Optional count of attached MCP tools/servers; displayed alongside the chip. */
	const count = ref<number>(0);

	function setActive(next: boolean): void {
		active.value = next;
	}

	function setCount(next: number): void {
		count.value = next < 0 ? 0 : next;
	}

	function reset(): void {
		active.value = false;
		count.value = 0;
	}

	return { active, count, setActive, setCount, reset };
});
