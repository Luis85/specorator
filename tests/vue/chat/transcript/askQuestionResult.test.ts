import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolCallInfo } from '@/core/types';
import AskQuestionResult from '@/features/chat/ui/vue/transcript/blocks/AskQuestionResult.vue';

function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'ask-1',
    name: 'AskUserQuestion',
    input: {},
    status: 'completed',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AskQuestionResult', () => {
  it('renders one review row per question, resolving the answer by stable id', async () => {
    const toolCall = createToolCall({
      input: { questions: [{ id: 'q1', question: 'Favorite color?' }] },
      resolvedAnswers: { q1: 'Blue' },
    });
    const { container } = render(AskQuestionResult, { props: { toolCall } });
    await flushPromises();

    expect(container.querySelector('.specorator-ask-review')).not.toBeNull();
    const pairs = container.querySelectorAll('.specorator-ask-review-pair');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].querySelector('.specorator-ask-review-num')?.textContent).toBe('1.');
    expect(pairs[0].querySelector('.specorator-ask-review-q-text')?.textContent).toBe('Favorite color?');
    expect(pairs[0].querySelector('.specorator-ask-review-a-text')?.textContent).toBe('Blue');
  });

  it('falls back to matching by question text when no id is present', async () => {
    const toolCall = createToolCall({
      input: { questions: [{ question: 'Color?' }] },
      resolvedAnswers: { 'Color?': 'Green' },
    });
    const { container } = render(AskQuestionResult, { props: { toolCall } });
    await flushPromises();

    expect(container.querySelector('.specorator-ask-review-a-text')?.textContent).toBe('Green');
  });

  it('joins array answers with ", "', async () => {
    const toolCall = createToolCall({
      input: { questions: [{ id: 'q1', question: 'Pick fruits' }] },
      resolvedAnswers: { q1: ['Apple', 'Pear'] },
    });
    const { container } = render(AskQuestionResult, { props: { toolCall } });
    await flushPromises();

    expect(container.querySelector('.specorator-ask-review-a-text')?.textContent).toBe('Apple, Pear');
  });

  it('renders "Not answered" in .specorator-ask-review-empty when the answer is missing', async () => {
    const toolCall = createToolCall({
      input: { questions: [{ id: 'q1', question: 'Color?' }] },
      resolvedAnswers: { other: 'x' },
    });
    const { container } = render(AskQuestionResult, { props: { toolCall } });
    await flushPromises();

    const empty = container.querySelector('.specorator-ask-review-empty');
    expect(empty?.textContent).toBe('Not answered');
    expect(container.querySelector('.specorator-ask-review-a-text')).toBeNull();
  });

  it('parses answers from result text when resolvedAnswers is absent', async () => {
    const toolCall = createToolCall({
      input: { questions: [{ question: 'Color?' }] },
      result: '"Color?"="Blue"',
    });
    const { container } = render(AskQuestionResult, { props: { toolCall } });
    await flushPromises();

    expect(container.querySelector('.specorator-ask-review-a-text')?.textContent).toBe('Blue');
  });

  it('renders multiple questions in order', async () => {
    const toolCall = createToolCall({
      input: {
        questions: [
          { id: 'q1', question: 'Color?' },
          { id: 'q2', question: 'Size?' },
        ],
      },
      resolvedAnswers: { q1: 'Blue', q2: 'Large' },
    });
    const { container } = render(AskQuestionResult, { props: { toolCall } });
    await flushPromises();

    const pairs = container.querySelectorAll('.specorator-ask-review-pair');
    expect(pairs).toHaveLength(2);
    expect(pairs[1].querySelector('.specorator-ask-review-num')?.textContent).toBe('2.');
    expect(pairs[1].querySelector('.specorator-ask-review-a-text')?.textContent).toBe('Large');
  });

  it('falls back to a plain result row when there are no questions/answers to resolve', async () => {
    const toolCall = createToolCall({ input: {}, result: 'Answer submitted successfully.' });
    const { container } = render(AskQuestionResult, { props: { toolCall } });
    await flushPromises();

    expect(container.querySelector('.specorator-ask-review')).toBeNull();
    const row = container.querySelector('.specorator-tool-result-row');
    expect(row?.querySelector('.specorator-tool-result-text')?.textContent).toBe('Answer submitted successfully.');
  });

  it('falls back to "Waiting for answer..." when there is no result either', async () => {
    const toolCall = createToolCall({ input: {} });
    const { container } = render(AskQuestionResult, { props: { toolCall } });
    await flushPromises();

    expect(container.querySelector('.specorator-tool-result-text')?.textContent).toBe('Waiting for answer...');
  });

  it('masks secret answers in review rows after hydration', async () => {
    const toolCall = createToolCall({
      input: { questions: [{ id: 'q1', question: 'API key?', isSecret: true }] },
      resolvedAnswers: { q1: 'sk-live-secret-value' },
    });
    const { container } = render(AskQuestionResult, { props: { toolCall } });
    await flushPromises();

    expect(container.querySelector('.specorator-ask-review-a-text')?.textContent).toBe('••••••');
    expect(container.textContent).not.toContain('sk-live-secret-value');
  });

  it('leaves non-secret answers visible in review rows', async () => {
    const toolCall = createToolCall({
      input: {
        questions: [
          { id: 'q1', question: 'Color?', isSecret: false },
          { id: 'q2', question: 'API key?', isSecret: true },
        ],
      },
      resolvedAnswers: { q1: 'Blue', q2: 'sk-live-secret-value' },
    });
    const { container } = render(AskQuestionResult, { props: { toolCall } });
    await flushPromises();

    const answers = container.querySelectorAll('.specorator-ask-review-a-text');
    expect(answers[0]?.textContent).toBe('Blue');
    expect(answers[1]?.textContent).toBe('••••••');
    expect(container.textContent).not.toContain('sk-live-secret-value');
  });
});
