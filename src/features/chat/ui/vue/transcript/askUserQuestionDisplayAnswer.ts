import { SECRET_VALUE_PLACEHOLDER } from '../../../../../core/security/secretIds';

/** Fixed mask for secret AskUserQuestion answers on every display surface. */
export const SECRET_ASK_ANSWER_DISPLAY = SECRET_VALUE_PLACEHOLDER;

/** Formats an ask-user answer for transcript/review UI, masking secrets. */
export function formatAskUserQuestionDisplayAnswer(
  raw: unknown,
  isSecret: boolean,
): string {
  if (isSecret) {
    const hasValue = Array.isArray(raw)
      ? raw.some((value) => String(value).trim().length > 0)
      : typeof raw === 'string' && raw.trim().length > 0;
    return hasValue ? SECRET_ASK_ANSWER_DISPLAY : '';
  }
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'string') return raw;
  return '';
}
