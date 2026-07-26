import { forceKillProcessGroup, forceKillProcessTree } from '../../../utils/processKill';

/**
 * Cursor's process-teardown entry points. The implementations were promoted to
 * `utils/processKill` when the onboarding CLI installer needed the same
 * behavior (the features layer cannot import provider internals); these aliases
 * keep Cursor's call sites and its CLAUDE.md vocabulary intact.
 *
 * `…Tree` is for the short one-shot probes (`--list-models`, aux runner): not
 * detached, no forked grandchildren. `…Group` is for the persistent `agent acp`
 * process, which IS spawned detached because it forks shell/git grandchildren.
 */
export const forceKillCursorProcessTree = forceKillProcessTree;
export const forceKillCursorProcessGroup = forceKillProcessGroup;
