/**
 * T-CP-043 (RED) — the instruction ladder (TEST-CP-011 confirm leg, TEST-CP-025).
 *
 * SPEC-CP-027, REQ-CP-015..019. `#` at empty input → instruction mode → submit →
 * (if a refine use case is available) `RefineInstructionUseCase` presents the
 * refined instruction; a refine failure falls through with the RAW instruction
 * (EC-CP-9) → `useInstructionConfirm()(instruction)` → accept →
 * `SettingsPort.saveSettings({ customSystemPrompt: appendInstruction(existing,
 * accepted) })` (APPEND, prior preserved, REQ-CP-018); reject → persist nothing
 * (REQ-CP-017); empty submit → exit, persist nothing (REQ-CP-019).
 *
 * Traces: REQ-CP-015/016/017/018/019.
 */
import { describe, it, expect, vi } from 'vitest';
import { useComposerMode } from '@/ui/chat/composer/useComposerMode';
import { RunCommandUseCase } from '@/application/chat/composer/RunCommandUseCase';
import { ResolveMentionUseCase } from '@/application/chat/composer/ResolveMentionUseCase';
import { SubmitBangBashUseCase } from '@/application/chat/composer/SubmitBangBashUseCase';
import { RefineInstructionUseCase } from '@/application/chat/composer/RefineInstructionUseCase';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockAuxModel } from '@/infrastructure/mock/MockAuxModel';
import {
	MockMentionDataProvider,
	MockProviderCommandCatalog,
	MockShellExec,
} from '@/infrastructure/mock/MockComposerPorts';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';
import type { SettingsPort } from '@/domain/ports';
import type { InstructionConfirmFn } from '@/ui/chat/modalSeam';

function fakeSettings(initial: PluginSettings): {
	port: SettingsPort;
	saved: PluginSettings[];
} {
	let current = initial;
	const saved: PluginSettings[] = [];
	const port: SettingsPort = {
		getSettings: () => Promise.resolve(current),
		saveSettings: (s) => {
			current = s;
			saved.push(s);
			return Promise.resolve();
		},
	};
	return { port, saved };
}

interface LadderOpts {
	refine?: RefineInstructionUseCase;
	settings: SettingsPort;
	confirm: InstructionConfirmFn;
	runtimeScript?: ConstructorParameters<typeof MockChatRuntime>[0];
}

function makeArbiter(opts: LadderOpts) {
	const runtime = new MockChatRuntime(opts.runtimeScript ?? []);
	return useComposerMode({
		runCommand: new RunCommandUseCase(),
		resolveMention: new ResolveMentionUseCase(new MockMentionDataProvider()),
		submitBangBash: new SubmitBangBashUseCase(new MockShellExec()),
		catalog: new MockProviderCommandCatalog(),
		runtime,
		onInsert: vi.fn(),
		onAction: vi.fn(),
		onBangBashOutput: vi.fn(),
		getValue: () => '',
		getCaret: () => 0,
		refineInstruction: opts.refine,
		settings: opts.settings,
		confirmInstruction: opts.confirm,
	});
}

describe('instruction ladder — accept (TEST-CP-025, REQ-CP-018)', () => {
	it('accept appends to the existing customSystemPrompt (prior preserved)', async () => {
		const { port, saved } = fakeSettings({ ...DEFAULT_SETTINGS, customSystemPrompt: 'Be terse.' });
		const confirm = vi.fn<InstructionConfirmFn>(() =>
			Promise.resolve({ kind: 'accept', instruction: 'Use TypeScript.' }),
		);
		const arbiter = makeArbiter({ settings: port, confirm });
		await arbiter.submitInstruction('use ts');
		expect(saved).toHaveLength(1);
		expect(saved[0].customSystemPrompt).toBe('Be terse.\n\nUse TypeScript.');
	});

	it('accept on an empty existing prompt sets the raw accepted instruction', async () => {
		const { port, saved } = fakeSettings({ ...DEFAULT_SETTINGS, customSystemPrompt: '' });
		const confirm: InstructionConfirmFn = () =>
			Promise.resolve({ kind: 'accept', instruction: 'Use TypeScript.' });
		const arbiter = makeArbiter({ settings: port, confirm });
		await arbiter.submitInstruction('use ts');
		expect(saved[0].customSystemPrompt).toBe('Use TypeScript.');
	});
});

describe('instruction ladder — reject / empty (REQ-CP-017/019)', () => {
	it('reject persists nothing', async () => {
		const { port, saved } = fakeSettings({ ...DEFAULT_SETTINGS, customSystemPrompt: 'Be terse.' });
		const confirm: InstructionConfirmFn = () => Promise.resolve({ kind: 'reject' });
		const arbiter = makeArbiter({ settings: port, confirm });
		await arbiter.submitInstruction('use ts');
		expect(saved).toHaveLength(0);
	});

	it('an empty/whitespace submit exits and persists nothing (REQ-CP-019)', async () => {
		const { port, saved } = fakeSettings(DEFAULT_SETTINGS);
		const confirm = vi.fn<InstructionConfirmFn>(() => Promise.resolve({ kind: 'reject' }));
		const arbiter = makeArbiter({ settings: port, confirm });
		await arbiter.submitInstruction('   ');
		expect(confirm).not.toHaveBeenCalled();
		expect(saved).toHaveLength(0);
	});
});

describe('instruction ladder — refine (EC-CP-9)', () => {
	it('presents the refined instruction to the confirm modal', async () => {
		const { port } = fakeSettings(DEFAULT_SETTINGS);
		// P5 (SPEC-CA-018): refine runs over the AuxModelPort; the arbiter still takes
		// a runtime for the other modes. The aux scripts the refined instruction.
		const runtime = new MockChatRuntime([]);
		const aux = new MockAuxModel();
		aux.setAuxResponse('<instruction>Always use TypeScript.</instruction>');
		const refine = new RefineInstructionUseCase(aux);
		const confirm = vi.fn<InstructionConfirmFn>(() => Promise.resolve({ kind: 'reject' }));
		const arbiter = useComposerMode({
			runCommand: new RunCommandUseCase(),
			resolveMention: new ResolveMentionUseCase(new MockMentionDataProvider()),
			submitBangBash: new SubmitBangBashUseCase(new MockShellExec()),
			catalog: new MockProviderCommandCatalog(),
			runtime,
			onInsert: vi.fn(),
			onAction: vi.fn(),
			onBangBashOutput: vi.fn(),
			getValue: () => '',
			getCaret: () => 0,
			refineInstruction: refine,
			settings: port,
			confirmInstruction: confirm,
		});
		await arbiter.submitInstruction('use ts');
		expect(confirm).toHaveBeenCalledWith('Always use TypeScript.');
	});

	it('a refine failure falls through with the RAW instruction (EC-CP-9)', async () => {
		const { port } = fakeSettings(DEFAULT_SETTINGS);
		// An aux err (cold-start failed / empty) → Result.err → fall through to raw.
		const runtime = new MockChatRuntime([]);
		const aux = new MockAuxModel();
		aux.setAuxError();
		const refine = new RefineInstructionUseCase(aux);
		const confirm = vi.fn<InstructionConfirmFn>(() => Promise.resolve({ kind: 'reject' }));
		const arbiter = useComposerMode({
			runCommand: new RunCommandUseCase(),
			resolveMention: new ResolveMentionUseCase(new MockMentionDataProvider()),
			submitBangBash: new SubmitBangBashUseCase(new MockShellExec()),
			catalog: new MockProviderCommandCatalog(),
			runtime,
			onInsert: vi.fn(),
			onAction: vi.fn(),
			onBangBashOutput: vi.fn(),
			getValue: () => '',
			getCaret: () => 0,
			refineInstruction: refine,
			settings: port,
			confirmInstruction: confirm,
		});
		await arbiter.submitInstruction('use ts');
		expect(confirm).toHaveBeenCalledWith('use ts');
	});
});
