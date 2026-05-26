/**
 * Barrel for the settings domain (SPEC-SS-001/005). Pure data + pure functions —
 * no `obsidian`/`node:*`/Vue (ADR-001).
 */
export {
	buildNavMappingText,
	parseNavMappings,
	NAV_MAPPING_INVALID_KEY,
	type NavAction,
	type NavMappings,
} from './keyboardNav';
