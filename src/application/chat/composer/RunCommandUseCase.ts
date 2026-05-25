import { ok, type Result } from '@/domain/shared/Result';
import type { CatalogEntry } from '@/domain/ports';
import { builtInActionFor, type BuiltInAction } from './builtInCommands';

/**
 * The outcome of dispatching a selected catalog entry (SPEC-CP-013):
 * - an action built-in runs an action the UI dispatches (REQ-CP-006);
 * - a provider entry (or a built-in without an action) inserts `prefix+name+' '`
 *   into the composer (REQ-CP-005).
 */
export type RunCommandOutcome =
	| { kind: 'insert'; text: string }
	| { kind: 'action'; action: BuiltInAction };

/**
 * RunCommandUseCase (SPEC-CP-013, REQ-CP-005/006). Dispatches a selected
 * `CatalogEntry`: a `builtIn:true` entry whose name maps to a `BuiltInAction`
 * resolves `{kind:'action'}` (the UI dispatches the existing tab/session action);
 * a provider entry — or a built-in without an action — resolves `{kind:'insert';
 * text: prefix+name+' '}`. `Result`-returning (ADR-004); the dispatch itself is
 * pure (the action's own `Result.err`, if any, surfaces in the UI dispatch, not
 * here). No provider branch; no `obsidian`/`node:*`/Vue import.
 */
export class RunCommandUseCase {
	execute(entry: CatalogEntry): Promise<Result<RunCommandOutcome>> {
		const action = entry.builtIn ? builtInActionFor(entry.name) : null;
		if (action !== null) {
			return Promise.resolve(ok({ kind: 'action', action }));
		}
		return Promise.resolve(ok({ kind: 'insert', text: `${entry.prefix}${entry.name} ` }));
	}
}
