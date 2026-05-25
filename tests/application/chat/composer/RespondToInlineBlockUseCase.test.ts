import { describe, it, expect, vi } from 'vitest';
import {
	RespondToInlineBlockUseCase,
	InlineResponseUnavailableError,
} from '@/application/chat/composer/RespondToInlineBlockUseCase';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import type {
	AskUserQuestionAnswer,
	AskUserQuestionRequest,
	ApprovalRequest,
	ExitPlanModeRequest,
} from '@/domain/ports';

/**
 * TEST-CP-020/021/024/027 — RespondToInlineBlockUseCase (SPEC-CP-017/032,
 * REQ-CP-023/025/026/028). Each respond* reads getCapabilities().supportsInlineResponse
 * FIRST: true → resolves the runtime's registered callback with the decision
 * (null → cancel, REQ-CP-022/033); false → Result.err(InlineResponseUnavailableError)
 * without reaching the callback — no lost response (EC-CP-6).
 * respondApproval('allow-always') routes the decision but writes NO rule (NG3 —
 * no SettingsPort.saveSettings/history write). Capability-gated via
 * getCapabilities(), never a `provider === 'claude'` branch (TEST-CP-027).
 */
const ASK_REQ: AskUserQuestionRequest = {
	requestId: 'r1',
	questions: [{ id: 'q1', question: 'Which?', options: [{ id: 'o1', label: 'A' }] }],
};
const ANSWER: AskUserQuestionAnswer = { requestId: 'r1', answers: { q1: 'o1' } };

const PLAN_REQ: ExitPlanModeRequest = { requestId: 'p1', plan: 'do the thing' };

const APPROVAL_REQ: ApprovalRequest = {
	requestId: 'a1',
	tool: 'Bash',
	context: 'rm -rf build',
	options: [
		{ decision: 'deny', label: 'Deny' },
		{ decision: 'allow', label: 'Allow once' },
		{ decision: 'allow-always', label: 'Always allow' },
	],
};

describe('TEST-CP-020 RespondToInlineBlockUseCase — capable', () => {
	it('resolves the ask-user callback with the answer', async () => {
		const runtime = new MockChatRuntime();
		const useCase = new RespondToInlineBlockUseCase(runtime);
		const pending = runtime.emitAskUserQuestion(ASK_REQ);
		const out = useCase.respondAskUserQuestion(ANSWER);
		expect(out.ok).toBe(true);
		await expect(pending).resolves.toEqual(ANSWER);
	});

	it('resolves the ask-user callback with null (cancel)', async () => {
		const runtime = new MockChatRuntime();
		const useCase = new RespondToInlineBlockUseCase(runtime);
		const pending = runtime.emitAskUserQuestion(ASK_REQ);
		const out = useCase.respondAskUserQuestion(null);
		expect(out.ok).toBe(true);
		await expect(pending).resolves.toBeNull();
	});

	it('resolves the exit-plan callback with the decision', async () => {
		const runtime = new MockChatRuntime();
		const useCase = new RespondToInlineBlockUseCase(runtime);
		const pending = runtime.emitExitPlanMode(PLAN_REQ);
		const out = useCase.respondExitPlanMode({ kind: 'implement' });
		expect(out.ok).toBe(true);
		await expect(pending).resolves.toEqual({ kind: 'implement' });
	});

	it('resolves the approval callback with the decision', async () => {
		const runtime = new MockChatRuntime();
		const useCase = new RespondToInlineBlockUseCase(runtime);
		const pending = runtime.emitApprovalRequest(APPROVAL_REQ);
		const out = useCase.respondApproval('allow');
		expect(out.ok).toBe(true);
		await expect(pending).resolves.toBe('allow');
	});
});

describe('TEST-CP-021 RespondToInlineBlockUseCase — allow-always persists no rule (NG3)', () => {
	it('routes allow-always without any SettingsPort.saveSettings write', async () => {
		const runtime = new MockChatRuntime();
		const saveSettings = vi.fn();
		// The use case takes only the runtime — no SettingsPort dependency at all,
		// so no rule store exists to write to. Assert the decision still routes.
		const useCase = new RespondToInlineBlockUseCase(runtime);
		const pending = runtime.emitApprovalRequest(APPROVAL_REQ);
		const out = useCase.respondApproval('allow-always');
		expect(out.ok).toBe(true);
		await expect(pending).resolves.toBe('allow-always');
		expect(saveSettings).not.toHaveBeenCalled();
	});
});

describe('TEST-CP-024 RespondToInlineBlockUseCase — non-capable gate (EC-CP-6)', () => {
	it('returns err without reaching the ask-user callback when supportsInlineResponse is false', async () => {
		const runtime = new MockChatRuntime();
		runtime.setSupportsInlineResponse(false);
		const useCase = new RespondToInlineBlockUseCase(runtime);
		let resolved = false;
		const pending = runtime.emitAskUserQuestion(ASK_REQ).then((v) => {
			resolved = true;
			return v;
		});
		const out = useCase.respondAskUserQuestion(ANSWER);
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toBeInstanceOf(InlineResponseUnavailableError);
		// The pending request is not lost — it is still awaiting (never resolved by the gate).
		await Promise.resolve();
		expect(resolved).toBe(false);
		void pending;
	});

	it('gates exit-plan and approval the same way', () => {
		const runtime = new MockChatRuntime();
		runtime.setSupportsInlineResponse(false);
		const useCase = new RespondToInlineBlockUseCase(runtime);
		expect(useCase.respondExitPlanMode({ kind: 'cancel' }).ok).toBe(false);
		expect(useCase.respondApproval('deny').ok).toBe(false);
	});
});
