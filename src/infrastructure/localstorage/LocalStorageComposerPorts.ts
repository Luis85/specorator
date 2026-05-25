import type {
	MentionDataProviderPort,
	MentionReferent,
	ProviderCommandCatalogPort,
	CatalogEntry,
	CatalogEntryKind,
	ShellExecPort,
	ShellExecRequest,
	ShellExecResult,
	AuxModelPort,
	AuxModelRunOptions,
	SelectionSourcePort,
	SelectionHighlightPort,
} from '@/domain/ports';
import type { CapturedSelection, EditorSelectionContext } from '@/domain/chat/attachments/Selection';
import type { Unsubscriber } from '@/domain/ports/shared';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

/**
 * LocalStorage (GitHub Pages demo) composer ports (SPEC-CP-010). The mention +
 * catalog providers return FIXTURE lists so the palettes work in the browser demo;
 * ShellExec is honestly gated OFF — `run` resolves `err` (no silent dead path,
 * parity ADR-TS-004 transport honesty). No `node:*`, no spawn.
 */

const DEMO_REFERENTS: readonly MentionReferent[] = [
	{ kind: 'file', name: 'README.md', mentionText: '@README.md', detail: 'README.md' },
	{ kind: 'folder', name: 'docs', mentionText: '@docs/', detail: 'docs' },
	{
		kind: 'subagent',
		name: 'reviewer',
		mentionText: '@reviewer',
		detail: 'Reviews diffs against the spec',
	},
];

const DEMO_COMMANDS: readonly CatalogEntry[] = [
	{ kind: 'command', prefix: '/', name: 'review', description: 'Open a review', builtIn: false },
];
const DEMO_SKILLS: readonly CatalogEntry[] = [
	{ kind: 'skill', prefix: '$', name: 'summarise', description: 'Summarise a note', builtIn: false },
];

export class LocalStorageMentionDataProvider implements MentionDataProviderPort {
	query(filter: string, _signal?: AbortSignal): Promise<MentionReferent[]> {
		const needle = filter.trim().toLowerCase();
		const matched =
			needle === ''
				? DEMO_REFERENTS
				: DEMO_REFERENTS.filter((r) =>
						`${r.name}${r.detail ?? ''}`.toLowerCase().includes(needle),
				  );
		return Promise.resolve([...matched]);
	}
}

export class LocalStorageProviderCommandCatalog implements ProviderCommandCatalogPort {
	getEntries(kind: CatalogEntryKind): Promise<CatalogEntry[]> {
		return Promise.resolve(kind === 'command' ? [...DEMO_COMMANDS] : [...DEMO_SKILLS]);
	}
}

export class LocalStorageShellExec implements ShellExecPort {
	run(_request: ShellExecRequest): Promise<Result<ShellExecResult, Error>> {
		// Honest gating (SPEC-CP-010): no subprocess in a browser — never a silent
		// dead path. The bang-bash UI surfaces this notice (EC-CP-5).
		return Promise.resolve(err(new Error('shell execution is not available in the browser demo')));
	}
}

/**
 * Browser-safe `AuxModelPort` stand-in for the (deferred) GitHub Pages demo
 * (SPEC-CA-009 aux leg). No subprocess, never throws — the standalone demo's
 * title/refine/inline-edit side-queries resolve a canned echo so the surface
 * never crashes. `Result.ok` always (REQ-CA-021, NFR-CA-010). No `node:*`/spawn.
 */
export class LocalStorageAuxModel implements AuxModelPort {
	run(prompt: string, _options?: AuxModelRunOptions): Promise<Result<string>> {
		// Canned echo: the demo has no model — return a non-empty deterministic
		// stand-in so the consuming side-query maps to `ok` (never an error path).
		const echo = prompt.trim() === '' ? 'Demo response' : `Demo response: ${prompt.trim()}`;
		return Promise.resolve(ok(echo));
	}
}

/**
 * Inert `SelectionSourcePort` for the (deferred) GitHub Pages demo (SPEC-CA-009
 * selection leg, ADR-CA-003 §2). The browser demo cannot read an Obsidian editor /
 * canvas selection, so capture is honestly OFF: `getCurrentSelection() → null`,
 * `supportsBrowserSelection: false`, and `onSelectionChange` registers but never
 * fires (no poll). No `obsidian`, no `node:*`.
 */
export class LocalStorageSelectionSource implements SelectionSourcePort {
	readonly supportsBrowserSelection = false;

	getCurrentSelection(): CapturedSelection | null {
		return null;
	}

	onSelectionChange(_listener: (sel: CapturedSelection | null) => void): Unsubscriber {
		// Registers but never fires — the demo has no selection source.
		return () => {
			/* no-op */
		};
	}
}

/**
 * No-op `SelectionHighlightPort` for the GitHub Pages demo (SPEC-CA-009 selection
 * leg). There is no CM6 editor to paint — `show`/`clear` are inert and never throw.
 */
export class LocalStorageSelectionHighlight implements SelectionHighlightPort {
	show(_target: EditorSelectionContext): void {
		/* no-op — no editor in the browser demo */
	}

	clear(): void {
		/* no-op */
	}
}
