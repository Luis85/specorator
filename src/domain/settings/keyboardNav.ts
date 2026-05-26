/**
 * The PURE message-pane keyboard-nav validator (SPEC-SS-005, REQ-SS-070/071).
 * Regrown 1:1 from claudian `features/settings/keyboardNavigation.ts:6-60`. Each
 * line is `map <single-char-key> <action>`; the parser rejects an unknown action,
 * a multi-char key, a non-unique key (case-insensitive), a duplicate action, or a
 * missing action → `{error}` (nothing persisted). Defaults w/s/i. Total — never
 * throws; no `obsidian`/`node:*`/Vue/class (ADR-001/004).
 */

const NAV_ACTIONS = ['scrollUp', 'scrollDown', 'focusInput'] as const;
export type NavAction = (typeof NAV_ACTIONS)[number];

export interface NavMappings {
	readonly scrollUpKey: string;
	readonly scrollDownKey: string;
	readonly focusInputKey: string;
}

/** The i18n key surfaced when a mapping text is invalid (REQ-SS-071). */
export const NAV_MAPPING_INVALID_KEY = 'settings.keyboardNav.invalid';

/** Render the canonical `map <key> <action>` text from a NavMappings (REQ-SS-070). Total. */
export function buildNavMappingText(m: NavMappings): string {
	return [
		`map ${m.scrollUpKey} scrollUp`,
		`map ${m.scrollDownKey} scrollDown`,
		`map ${m.focusInputKey} focusInput`,
	].join('\n');
}

function isNavAction(value: string): value is NavAction {
	return (NAV_ACTIONS as readonly string[]).includes(value);
}

/** Validate one `map <key> <action>` line into the accumulator; return an error string or null. */
function parseLine(
	line: string,
	parsed: Partial<Record<NavAction, string>>,
	usedKeys: Map<string, string>,
): string | null {
	const parts = line.split(/\s+/);
	if (parts.length !== 3 || parts[0] !== 'map') {
		return 'Each line must follow "map <key> <action>"';
	}
	const [, key, rawAction] = parts;
	if (!isNavAction(rawAction)) return `Unknown action: ${rawAction}`;
	if (key.length !== 1) return `Key must be a single character for ${rawAction}`;

	const normalizedKey = key.toLowerCase();
	if (usedKeys.has(normalizedKey)) return 'Navigation keys must be unique';
	if (parsed[rawAction] !== undefined) return `Duplicate mapping for ${rawAction}`;

	usedKeys.set(normalizedKey, rawAction);
	parsed[rawAction] = key;
	return null;
}

/**
 * Parse the `map <key> <action>` text → `{settings}` on success, else `{error}`
 * (REQ-SS-071). Total — on any error nothing is persisted. The defaults are w/s/i.
 */
export function parseNavMappings(value: string): { settings?: NavMappings; error?: string } {
	const parsed: Partial<Record<NavAction, string>> = {};
	const usedKeys = new Map<string, string>();

	for (const rawLine of value.split('\n')) {
		const line = rawLine.trim();
		if (!line) continue;
		const error = parseLine(line, parsed, usedKeys);
		if (error !== null) return { error };
	}

	const missing = NAV_ACTIONS.filter((action) => parsed[action] === undefined);
	if (missing.length > 0) return { error: `Missing mapping for ${missing.join(', ')}` };

	// The `missing` guard above proves all three actions are present.
	return {
		settings: {
			scrollUpKey: parsed.scrollUp!,
			scrollDownKey: parsed.scrollDown!,
			focusInputKey: parsed.focusInput!,
		},
	};
}
