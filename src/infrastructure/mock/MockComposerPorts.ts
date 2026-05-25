import type {
	MentionDataProviderPort,
	MentionReferent,
	ProviderCommandCatalogPort,
	CatalogEntry,
	CatalogEntryKind,
	ShellExecPort,
	ShellExecRequest,
	ShellExecResult,
} from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok } from '@/domain/shared/Result';

/**
 * Mock composer ports (SPEC-CP-009) for `npm run dev` + unit tests. No `obsidian`,
 * no `node:*`, never spawns a process — the scripted-echo ShellExec drives the
 * full bang-bash flow without a subprocess (S1, REQ-CP-032). The mention/catalog
 * providers are fixture composites proving the empty-MCP branch + request-id-guard
 * backing (the consumer owns the actual guard, SPEC-CP-018).
 */

const FIXTURE_REFERENTS: readonly MentionReferent[] = [
	{ kind: 'file', name: 'notes.md', mentionText: '@notes.md', detail: 'notes.md' },
	{ kind: 'file', name: 'tasks.md', mentionText: '@specs/tasks.md', detail: 'specs/tasks.md' },
	{ kind: 'folder', name: 'specs', mentionText: '@specs/', detail: 'specs' },
	{
		kind: 'subagent',
		name: 'reviewer',
		mentionText: '@reviewer',
		detail: 'Reviews diffs against the spec',
	},
	// MCP source is no-op [] in P4 (P8/NG4) — no mcp-server referent here.
];

const MENTION_CAP = 50;

/** Fixture mention provider (SPEC-CP-009): in-memory referents, no Obsidian. */
export class MockMentionDataProvider implements MentionDataProviderPort {
	constructor(private readonly referents: readonly MentionReferent[] = FIXTURE_REFERENTS) {}

	query(filter: string, _signal?: AbortSignal): Promise<MentionReferent[]> {
		const needle = filter.trim().toLowerCase();
		const matched =
			needle === ''
				? this.referents
				: this.referents.filter((r) =>
						`${r.name}${r.detail ?? ''}`.toLowerCase().includes(needle),
				  );
		return Promise.resolve(matched.slice(0, MENTION_CAP));
	}
}

const FIXTURE_COMMANDS: readonly CatalogEntry[] = [
	{ kind: 'command', prefix: '/', name: 'deploy', description: 'Deploy the project', builtIn: false },
	{ kind: 'command', prefix: '/', name: 'review', description: 'Open a review', builtIn: false },
];

const FIXTURE_SKILLS: readonly CatalogEntry[] = [
	{ kind: 'skill', prefix: '$', name: 'summarise', description: 'Summarise a note', builtIn: false },
];

/**
 * Fixture command/skill catalog (SPEC-CP-009): scripted entries + a
 * `seedCatalogDelay(ms)` hook so a test can fire a stale + a fresh response to
 * prove request-id guarding (REQ-CP-004, the guard lives in the consumer).
 */
export class MockProviderCommandCatalog implements ProviderCommandCatalogPort {
	private delayMs = 0;

	/** Test hook: delay the NEXT `getEntries` resolution by `ms` (stale/fresh race). */
	seedCatalogDelay(ms: number): void {
		this.delayMs = ms;
	}

	getEntries(kind: CatalogEntryKind): Promise<CatalogEntry[]> {
		const entries = kind === 'command' ? [...FIXTURE_COMMANDS] : [...FIXTURE_SKILLS];
		const delay = this.delayMs;
		this.delayMs = 0;
		if (delay <= 0) return Promise.resolve(entries);
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve(entries);
			}, delay);
		});
	}
}

/**
 * Scripted-echo ShellExec (SPEC-CP-009): over a fixture `Map<command,
 * ShellExecResult>`. Default echoes the command on stdout with `exitCode 0`; a
 * seeded entry scripts a non-zero exit / a truncated result. **NEVER spawns a
 * process** (S1/REQ-CP-032 — no `child_process`/`node:*` import). `run` always
 * resolves `ok` (the Mock has no spawn-failure path).
 */
export class MockShellExec implements ShellExecPort {
	private readonly scripted = new Map<string, ShellExecResult>();

	/** Test hook: script the result for an exact command string. */
	seed(command: string, result: ShellExecResult): void {
		this.scripted.set(command, result);
	}

	run(request: ShellExecRequest): Promise<Result<ShellExecResult, Error>> {
		const scripted = this.scripted.get(request.command);
		const result: ShellExecResult = scripted ?? {
			command: request.command,
			stdout: request.command,
			stderr: '',
			exitCode: 0,
			truncated: false,
		};
		return Promise.resolve(ok(result));
	}
}
