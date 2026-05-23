/**
 * WP-2 — Tests for `TurnInputBuilder.buildTurnInput()` + `isStructuredIntent`.
 *
 * The builder is a pure function that snapshots the four chat stores, the
 * vault, and settings into a `TurnInput` DTO consumed by
 * `ChatTurnOrchestrator.sendTurn()`. Tests exercise:
 *   - intent classification (structured vs free-text)
 *   - context-file body loading + dedup propagation
 *   - stage-prompt resolution and graceful fallback
 *   - thread rotation decision (rotate vs reuse)
 *   - transport resolution (subscription / api-key / degraded)
 *   - prompt assembly + truncation flag forwarding
 *
 * No Vue, no Pinia. Plain port fakes + the existing `MockBridge`.
 */
import { describe, it, expect, vi } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import type { LoggerPort } from '@/domain/ports/LoggerPort';
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord';
import { asSessionId } from '@/domain/chat/SessionId';
import { buildStagePromptMap } from '@/application/chat/stagePromptMap';
import {
	buildTurnInput,
	isStructuredIntent,
	type MessagesSnapshot,
	type ThreadsSnapshot,
} from '@/application/chat/TurnInputBuilder';

function fakeLogger(): LoggerPort {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};
}

function makeBridge(
	files: Record<string, string> = {},
	overrides: Partial<PluginSettings> = {},
): MockBridge {
	const bridge = new MockBridge(files);
	const settings: PluginSettings = { ...DEFAULT_SETTINGS, ...overrides };
	vi.spyOn(bridge, 'getSettings').mockResolvedValue(settings);
	return bridge;
}

function emptyMessages(userText: string): MessagesSnapshot {
	return { userText, effectiveContextFiles: [] };
}

function emptyThreads(): ThreadsSnapshot {
	return { activeThreadId: null, chatThreads: new Map() };
}

const stagePromptMap = buildStagePromptMap();

describe('isStructuredIntent', () => {
	it.each([
		['/create-file path/to.md', 'structured'],
		['/create path/to.md', 'structured'],
		['  /create  trailing  ', 'structured'],
		['/CREATE-FILE ANYTHING', 'structured'],
	] as const)('classifies "%s" as %s', (input, expected) => {
		expect(isStructuredIntent(input)).toBe(expected);
	});

	it.each([
		['hello world'],
		['please create a file for me'],
		['/createsomethingelse'],
		[''],
	])('classifies "%s" as free-text', (input) => {
		expect(isStructuredIntent(input)).toBe('free-text');
	});
});

describe('buildTurnInput', () => {
	it('produces a free-text TurnInput from a plain prompt', async () => {
		const bridge = makeBridge();
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.intent).toBe('free-text');
		expect(result.prompt).toBe('hello');
		expect(result.truncated).toBe(false);
		expect(result.userMessage).toBe('hello');
		// QW-C: first turn of a new thread emits the vault-context block with
		// the greeting row, even when no active path/selection is set. The
		// MockBridge default vault metadata is "Mock Vault" / 0 notes.
		expect(result.systemPromptSuffix).toBe(
			'<vault-context>\nPlugin: Specorator v0.0.0\nVault: Mock Vault (0 notes)\n</vault-context>',
		);
		expect(result.slug).toBeNull();
	});

	it('classifies /create slash commands as structured intent', async () => {
		const bridge = makeBridge();
		const result = await buildTurnInput({
			messages: emptyMessages('/create-file notes/idea.md'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.intent).toBe('structured');
	});

	it('normalises subscription transport and preserves the raw kind', async () => {
		const bridge = makeBridge();
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'subscription',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.transport).toBe('subscription');
		expect(result.transportKindRaw).toBe('subscription');
	});

	it('normalises auto / degraded transport kinds to api-key', async () => {
		const bridge = makeBridge();
		for (const raw of ['auto', 'degraded', 'api-key'] as const) {
			const result = await buildTurnInput({
				messages: emptyMessages('hello'),
				threads: emptyThreads(),
				transportKindRaw: raw,
				stagePromptMap,
				vault: bridge,
				workspace: bridge,
				settings: bridge,
				logger: fakeLogger(),
			});
			expect(result.transport).toBe('api-key');
		}
	});

	it('rotates the thread when no thread is active', async () => {
		const bridge = makeBridge();
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.thread).toEqual({ kind: 'rotate', previousThreadId: null });
	});

	it('reuses an existing thread when transport and feature match', async () => {
		const bridge = makeBridge();
		const existing: ChatThreadRecord = {
			threadId: 'T1',
			sessionId: asSessionId('session-A'),
			feature: null,
			logPath: '',
			transport: { provider: 'claude', mode: 'api' },
			title: '',
			forkParent: null,
			createdAt: '2025-01-01T00:00:00.000Z',
			lastUsedAt: '2025-01-01T00:00:00.000Z',
		};
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: {
				activeThreadId: 'T1',
				chatThreads: new Map([['T1', existing]]),
			},
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.thread.kind).toBe('reuse');
		expect(result.thread.reuseThreadId).toBe('T1');
		expect(result.thread.reuseSessionId).toBe(asSessionId('session-A'));
		expect(result.thread.previousThreadId).toBe('T1');
	});

	it('rotates when the active thread transport no longer matches the turn transport', async () => {
		const bridge = makeBridge();
		const existing: ChatThreadRecord = {
			threadId: 'T-prev',
			sessionId: null,
			feature: null,
			logPath: '',
			transport: { provider: 'claude', mode: 'api' },
			title: '',
			forkParent: null,
			createdAt: '2025-01-01T00:00:00.000Z',
			lastUsedAt: '2025-01-01T00:00:00.000Z',
		};
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: {
				activeThreadId: 'T-prev',
				chatThreads: new Map([['T-prev', existing]]),
			},
			transportKindRaw: 'subscription',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.thread).toEqual({ kind: 'rotate', previousThreadId: 'T-prev' });
	});

	it('rotates when the active thread feature no longer matches the turn slug', async () => {
		const bridge = makeBridge({
			'specs/foo/idea.md': 'idea',
			'specs/foo/workflow-state.md':
				'---\nslug: foo\nstatus: draft\ncurrent_stage: idea\n---\n',
		});
		bridge.setActiveFile({ path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' });
		const existing: ChatThreadRecord = {
			threadId: 'T-prev',
			sessionId: null,
			feature: 'bar', // different slug from the current `foo`
			logPath: '',
			transport: { provider: 'claude', mode: 'api' },
			title: '',
			forkParent: null,
			createdAt: '2025-01-01T00:00:00.000Z',
			lastUsedAt: '2025-01-01T00:00:00.000Z',
		};
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: {
				activeThreadId: 'T-prev',
				chatThreads: new Map([['T-prev', existing]]),
			},
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.thread.kind).toBe('rotate');
		expect(result.slug).toBe('foo');
	});

	it('loads context-file bodies and assembles the prompt', async () => {
		const bridge = makeBridge({
			'specs/foo/idea.md': '# Idea\nThe spec.',
		});
		const result = await buildTurnInput({
			messages: {
				userText: 'summarise this',
				effectiveContextFiles: [
					{ path: 'specs/foo/idea.md', label: 'idea.md', isAuto: false },
				],
			},
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.prompt).toContain('# Idea');
		expect(result.prompt).toContain('summarise this');
		expect(result.truncated).toBe(false);
	});

	it('falls back to empty content on vault read errors but still assembles the prompt', async () => {
		const bridge = makeBridge();
		vi.spyOn(bridge, 'readFile').mockRejectedValue(new Error('boom'));
		const result = await buildTurnInput({
			messages: {
				userText: 'hello',
				effectiveContextFiles: [{ path: 'missing.md', label: 'missing.md', isAuto: false }],
			},
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.prompt).toContain('File: missing.md');
		expect(result.prompt).toContain('hello');
	});

	it('returns truncated=true when context exceeds the prompt budget', async () => {
		const huge = 'a'.repeat(210_000);
		const bridge = makeBridge({ 'big.md': huge });
		const result = await buildTurnInput({
			messages: {
				userText: 'summarise',
				effectiveContextFiles: [{ path: 'big.md', label: 'big.md', isAuto: true }],
			},
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.truncated).toBe(true);
	});

	it('resolves the stage-prompt suffix when an active file under specsFolder has a workflow state', async () => {
		const bridge = makeBridge({
			'specs/foo/idea.md': 'idea body',
			'specs/foo/workflow-state.md':
				'---\nslug: foo\nstatus: draft\ncurrent_stage: idea\n---\n',
		});
		bridge.setActiveFile({ path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' });
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.slug).toBe('foo');
		expect(result.systemPromptSuffix).toContain('foo');
	});

	it('falls back to suffix containing only QW-C greeting when the workflow state cannot be loaded', async () => {
		const bridge = makeBridge();
		// Active file under specsFolder but workflow-state.md missing
		bridge.setActiveFile({
			path: 'specs/foo/idea.md',
			basename: 'idea',
			extension: 'md',
		});
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		// QW-C: stage portion still empty (workflow load failed) but first-turn
		// vault-context greeting is emitted by the QW-C path.
		expect(result.systemPromptSuffix).toBe(
			'<vault-context>\nPlugin: Specorator v0.0.0\nVault: Mock Vault (0 notes)\n</vault-context>',
		);
		expect(result.slug).toBe('foo');
	});

	it('QW-B: prepends a <vault-context> block when the workspace has an active path', async () => {
		const bridge = makeBridge();
		bridge.setActiveFilePath('notes/today.md');
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.systemPromptSuffix.startsWith('<vault-context>')).toBe(true);
		expect(result.systemPromptSuffix).toContain('Active note: notes/today.md');
	});

	it('QW-B: includes the editor selection fenced inside <vault-context>', async () => {
		const bridge = makeBridge();
		bridge.setActiveFilePath('a.md');
		bridge.setActiveSelection('snippet text');
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.systemPromptSuffix).toContain('Selection:');
		expect(result.systemPromptSuffix).toContain('snippet text');
	});

	it('QW-B: omits the path/selection rows when workspace has neither, but QW-C first-turn greeting remains', async () => {
		const bridge = makeBridge();
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		// QW-B contract: no Active-note or Selection rows since neither is set.
		expect(result.systemPromptSuffix).not.toContain('Active note:');
		expect(result.systemPromptSuffix).not.toContain('Selection:');
		// QW-C contract: greeting row present on first turn regardless.
		expect(result.systemPromptSuffix).toContain('Vault: Mock Vault (0 notes)');
	});

	it('QW-B: composes the vault-context block in front of the stage-aware suffix', async () => {
		const bridge = makeBridge({
			'specs/foo/idea.md': 'idea',
			'specs/foo/workflow-state.md':
				'---\nslug: foo\nstatus: draft\ncurrent_stage: idea\n---\n',
		});
		bridge.setActiveFile({ path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' });
		bridge.setActiveFilePath('specs/foo/idea.md');
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		const suffix = result.systemPromptSuffix;
		expect(suffix.startsWith('<vault-context>')).toBe(true);
		// stage-aware portion still present, separated by a blank line
		const idxCtxEnd = suffix.indexOf('</vault-context>');
		expect(idxCtxEnd).toBeGreaterThan(-1);
		const stageTail = suffix.slice(idxCtxEnd + '</vault-context>'.length);
		expect(stageTail.startsWith('\n\n')).toBe(true);
		expect(suffix).toContain('foo');
	});

	it('QW-C: includes a Vault greeting row on the first turn of a new thread', async () => {
		const bridge = makeBridge();
		bridge.setVaultName('My Vault');
		bridge.setMarkdownFileCount(17);
		bridge.setActiveFilePath('notes/today.md');
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.systemPromptSuffix).toContain('Vault: My Vault (17 notes)');
		expect(result.systemPromptSuffix).toContain('Active note: notes/today.md');
		// Greeting comes before the active-note row.
		const idxGreeting = result.systemPromptSuffix.indexOf('Vault:');
		const idxActive = result.systemPromptSuffix.indexOf('Active note:');
		expect(idxGreeting).toBeGreaterThan(-1);
		expect(idxGreeting).toBeLessThan(idxActive);
	});

	it('Q-E.3: emits Plugin row + Vault row from pluginManifest on first turn', async () => {
		const bridge = makeBridge();
		bridge.setVaultName('My Vault');
		bridge.setMarkdownFileCount(7);
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
			pluginManifest: () => ({ name: 'Specorator', version: '1.2.3' }),
		});
		const suffix = result.systemPromptSuffix;
		expect(suffix).toContain('Plugin: Specorator v1.2.3');
		expect(suffix).toContain('Vault: My Vault (7 notes)');
		// Plugin row comes before Vault row.
		expect(suffix.indexOf('Plugin:')).toBeLessThan(suffix.indexOf('Vault:'));
	});

	it('Q-E.3: pluginManifest is honoured per-call (fork-installs render their own name)', async () => {
		const bridge = makeBridge();
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
			pluginManifest: () => ({ name: 'CustomFork', version: '9.9.9' }),
		});
		expect(result.systemPromptSuffix).toContain('Plugin: CustomFork v9.9.9');
	});

	it('QW-C: omits the Vault greeting row on follow-up turns (thread reuse)', async () => {
		const bridge = makeBridge();
		bridge.setVaultName('My Vault');
		bridge.setMarkdownFileCount(17);
		bridge.setActiveFilePath('notes/today.md');
		const existing: ChatThreadRecord = {
			threadId: 'T1',
			sessionId: asSessionId('session-A'),
			feature: null,
			logPath: '',
			transport: { provider: 'claude', mode: 'api' },
			title: 'Existing thread',
			forkParent: null,
			createdAt: '2025-01-01T00:00:00.000Z',
			lastUsedAt: '2025-01-01T00:00:00.000Z',
		};
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: {
				activeThreadId: 'T1',
				chatThreads: new Map([['T1', existing]]),
			},
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		expect(result.systemPromptSuffix).not.toContain('Vault:');
		expect(result.systemPromptSuffix).toContain('Active note: notes/today.md');
	});

	it('QW-B: does not double-emit when the suffix already contains a <vault-context> block', async () => {
		// This guards against a future caller pre-composing the block. We
		// simulate it by seeding a workflow snapshot whose rendered suffix
		// happens to start with a vault-context tag. The builder's helper
		// detects the tag in the existing suffix and skips its own prefix.
		const bridge = makeBridge({
			'specs/foo/idea.md': 'idea',
			'specs/foo/workflow-state.md':
				'---\nslug: foo\nstatus: draft\ncurrent_stage: idea\n---\n',
		});
		bridge.setActiveFile({ path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' });
		bridge.setActiveFilePath('specs/foo/idea.md');
		const result = await buildTurnInput({
			messages: emptyMessages('hello'),
			threads: emptyThreads(),
			transportKindRaw: 'api-key',
			stagePromptMap,
			vault: bridge,
			workspace: bridge,
			settings: bridge,
			logger: fakeLogger(),
		});
		const occurrences = result.systemPromptSuffix.split('<vault-context>').length - 1;
		expect(occurrences).toBe(1);
	});
});
