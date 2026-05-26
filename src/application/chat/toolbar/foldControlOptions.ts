/**
 * `foldControlOptions` (P6, SPEC-TC-010, ADR-TC-002 §3) — the pure guarded fold of
 * the per-tab control selections into the additive `ChatRuntimeQueryOptions` fields.
 * Mirrors how `buildTurnRequest` folds P5 context. Pure + total — never throws, no
 * `obsidian`/`node:*`/Vue import, no `providerId` branch.
 */
import type { TabControls } from '@/domain/chat/toolbar/TabControls';
import type { ChatRuntimeQueryOptions } from '@/domain/chat/ChatTurn';

/**
 * Fold the per-tab control selections into the additive `ChatRuntimeQueryOptions`
 * fields (`model`/`mode`/`reasoning`/`serviceTier`/`permissionMode`). ADDITIVE +
 * GUARDED: a field is written ONLY when `controls` carries an explicit present
 * (non-empty) value, so an untouched toolbar yields `{}` (byte-identical to a P5/P6
 * turn, NFR-TC-001/NFR-AS-001, EC-TC-1/EC-AS-2). A descriptor default value is never
 * folded — the runtime applies its own default when a field is absent (EC-TC-6). The
 * P7 `permissionMode` clause writes the mode ONLY when present AND non-`'normal'`
 * (SPEC-AS-011, ADR-AS-002 §1) — `'normal'`/absent folds nothing so a no-rule + normal
 * tab is byte-identical to P6 (EC-AS-13, REQ-AS-052). The seam widgets (MCP/external)
 * contribute nothing. Pure + total — never throws.
 */
export function foldControlOptions(
	controls: TabControls,
): Partial<
	Pick<ChatRuntimeQueryOptions, 'model' | 'mode' | 'reasoning' | 'serviceTier' | 'permissionMode'>
> {
	const folded: Partial<
		Pick<
			ChatRuntimeQueryOptions,
			'model' | 'mode' | 'reasoning' | 'serviceTier' | 'permissionMode'
		>
	> = {};

	if (controls.model !== undefined && controls.model !== '') {
		folded.model = controls.model;
	}
	if (controls.mode !== undefined && controls.mode !== '') {
		folded.mode = controls.mode;
	}
	if (controls.reasoning !== undefined) {
		folded.reasoning = controls.reasoning;
	}
	if (controls.serviceTier !== undefined && controls.serviceTier !== '') {
		folded.serviceTier = controls.serviceTier;
	}
	if (controls.permissionMode !== undefined && controls.permissionMode !== 'normal') {
		folded.permissionMode = controls.permissionMode;
	}

	return folded;
}
