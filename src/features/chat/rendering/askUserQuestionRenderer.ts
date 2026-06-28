import { extractResolvedAnswersFromResultText } from '../../../core/tools/toolInput';
import type { AskUserQuestionItem, AskUserQuestionOption, ToolCallInfo } from '../../../core/types';
import { contentFallback } from './contentFallback';

function formatAnswer(raw: unknown): string {
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'string') return raw;
  return '';
}

function resolveAskUserAnswers(toolCall: ToolCallInfo): Record<string, unknown> | undefined {
  if (toolCall.resolvedAnswers) return toolCall.resolvedAnswers;

  const parsed = extractResolvedAnswersFromResultText(toolCall.result);
  if (parsed) {
    toolCall.resolvedAnswers = parsed;
    return parsed;
  }

  return undefined;
}

/** Review-mode rendering of an answered ask-user question. Returns false when
 * the tool call has no questions/answers to show, so the caller can fall back. */
export function renderAskUserQuestionResult(container: HTMLElement, toolCall: ToolCallInfo): boolean {
  container.empty();
  const questions = toolCall.input.questions as AskUserQuestionItem[] | undefined;
  const answers = resolveAskUserAnswers(toolCall);
  if (!questions || !Array.isArray(questions) || !answers) return false;

  const reviewEl = container.createDiv({ cls: 'specorator-ask-review' });
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const answer = formatAnswer(
      (q.id ? answers[q.id] : undefined) ?? answers[q.question]
    );
    const pairEl = reviewEl.createDiv({ cls: 'specorator-ask-review-pair' });
    pairEl.createDiv({ text: `${i + 1}.`, cls: 'specorator-ask-review-num' });
    const bodyEl = pairEl.createDiv({ cls: 'specorator-ask-review-body' });
    bodyEl.createDiv({ text: q.question, cls: 'specorator-ask-review-q-text' });
    bodyEl.createDiv({
      text: answer || 'Not answered',
      cls: answer ? 'specorator-ask-review-a-text' : 'specorator-ask-review-empty',
    });
  }

  return true;
}

/** Pre-answer rendering of an ask-user question (the options as a disabled
 * list), or a plain prompt fallback when no questions were recorded. */
export function renderAskUserQuestionFallback(
  container: HTMLElement,
  toolCall: ToolCallInfo,
  initialText?: string,
): void {
  container.empty();

  const questions = Array.isArray(toolCall.input.questions)
    ? toolCall.input.questions as AskUserQuestionItem[]
    : [];

  if (questions.length === 0) {
    contentFallback(container, initialText || toolCall.result || 'Waiting for answer...');
    return;
  }

  if (initialText || toolCall.result) {
    container.createDiv({
      cls: 'specorator-ask-review-prompt',
      text: initialText || toolCall.result || 'Waiting for answer...',
    });
  }

  for (let questionIndex = 0; questionIndex < questions.length; questionIndex++) {
    const question = questions[questionIndex];
    const reviewEl = container.createDiv({ cls: 'specorator-ask-review' });
    const pairEl = reviewEl.createDiv({ cls: 'specorator-ask-review-pair' });
    pairEl.createDiv({ text: `${questionIndex + 1}.`, cls: 'specorator-ask-review-num' });
    const bodyEl = pairEl.createDiv({ cls: 'specorator-ask-review-body' });
    bodyEl.createDiv({ text: question.question, cls: 'specorator-ask-review-q-text' });

    if (!Array.isArray(question.options) || question.options.length === 0) {
      bodyEl.createDiv({ cls: 'specorator-ask-review-empty', text: 'No options recorded' });
      continue;
    }

    const listEl = bodyEl.createDiv({ cls: 'specorator-ask-list' });
    question.options.forEach((option, optionIndex) => {
      renderAskUserQuestionOption(listEl, option, optionIndex, question.multiSelect === true);
    });
  }
}

function renderAskUserQuestionOption(
  parentEl: HTMLElement,
  option: AskUserQuestionOption,
  optionIndex: number,
  isMultiSelect: boolean,
): void {
  const itemEl = parentEl.createDiv({ cls: 'specorator-ask-item is-disabled' });

  if (isMultiSelect) {
    itemEl.createDiv({ cls: 'specorator-ask-check', text: '[ ] ' });
  } else {
    itemEl.createDiv({ cls: 'specorator-ask-item-num', text: `${optionIndex + 1}. ` });
  }

  const contentEl = itemEl.createDiv({ cls: 'specorator-ask-item-content' });
  const labelRowEl = contentEl.createDiv({ cls: 'specorator-ask-label-row' });
  labelRowEl.createDiv({ cls: 'specorator-ask-item-label', text: option.label });

  if (option.description) {
    contentEl.createDiv({ cls: 'specorator-ask-item-desc', text: option.description });
  }
}
