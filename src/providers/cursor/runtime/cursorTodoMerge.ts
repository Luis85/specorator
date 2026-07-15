import { mapCursorToolInput } from './cursorToolInputMapping';
import { stringValue } from './cursorToolValueCoercion';

/**
 * Pure todo-merge helpers for `cursor/update_todos`. The StreamController
 * replaces its whole todo panel from each emitted chunk, so a `merge: true`
 * batch (which carries only changed items) must be folded over the last emitted
 * list here before it is re-emitted, or unlisted todos would vanish.
 */
export type NormalizedTodo = Record<string, unknown>;

function todoIdentity(todo: NormalizedTodo): { id: string; content: string } {
  return {
    id: typeof todo.id === 'string' ? todo.id : '',
    content: typeof todo.content === 'string' ? todo.content : '',
  };
}

// Folds a batch over the last emitted list (the panel is fully replaced from
// each chunk). Matches by `id`, falling back to content; unmatched items append.
function mergeCursorTodos(previous: NormalizedTodo[], incoming: NormalizedTodo[]): NormalizedTodo[] {
  const result = previous.map((todo) => ({ ...todo }));
  const indexById = new Map<string, number>();
  const indexByContent = new Map<string, number>();
  result.forEach((todo, index) => {
    const { id, content } = todoIdentity(todo);
    if (id) indexById.set(id, index);
    if (content) indexByContent.set(content, index);
  });

  for (const item of incoming) {
    const { id, content } = todoIdentity(item);
    let matchIndex: number | undefined;
    if (id) {
      matchIndex = indexById.get(id);
    } else if (content) {
      matchIndex = indexByContent.get(content);
    }
    if (matchIndex !== undefined) {
      result[matchIndex] = { ...item };
      continue;
    }
    const appendedIndex = result.push({ ...item }) - 1;
    if (id) indexById.set(id, appendedIndex);
    if (content) indexByContent.set(content, appendedIndex);
  }
  return result;
}

// Patches a cached todo from a RAW entry: status always wins when present;
// content/activeForm overwrite only when the entry carries content (so a
// status-only `{id, status}` patch keeps the cached content intact).
function patchTodoFromRaw(cached: NormalizedTodo, raw: Record<string, unknown>): NormalizedTodo {
  const patched: NormalizedTodo = { ...cached };
  const status = stringValue(raw.status);
  if (status) {
    patched.status = status;
  }
  const content = stringValue(raw.content ?? raw.title ?? raw.step ?? raw.text);
  if (content) {
    patched.content = content;
    patched.activeForm = stringValue(raw.activeForm) || content;
  }
  return patched;
}

// Merges a RAW batch over the cached list BEFORE the content-requiring
// normalizer, so a status-only `{id, status}` transition isn't dropped; only
// unmatched entries fall through to the normalizer/append merge below.
export function mergeCursorTodosFromRaw(cached: NormalizedTodo[], rawIncoming: unknown[]): NormalizedTodo[] {
  const result = cached.map((todo) => ({ ...todo }));
  const indexById = new Map<string, number>();
  result.forEach((todo, index) => {
    const { id } = todoIdentity(todo);
    if (id) indexById.set(id, index);
  });

  const unmatchedRaw: unknown[] = [];
  for (const entry of rawIncoming) {
    if (!entry || typeof entry !== 'object') {
      unmatchedRaw.push(entry);
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const id = stringValue(raw.id);
    const matchIndex = id ? indexById.get(id) : undefined;
    if (matchIndex === undefined) {
      unmatchedRaw.push(entry);
      continue;
    }
    result[matchIndex] = patchTodoFromRaw(result[matchIndex], raw);
  }

  // Unmatched entries need content (the normalizer drops those without), then
  // fold in by id/content — new items append, content-matched items update.
  const normalizedUnmatched = (mapCursorToolInput('updateTodosToolCall', { todos: unmatchedRaw }, undefined)
    .todos as NormalizedTodo[] | undefined) ?? [];
  return mergeCursorTodos(result, normalizedUnmatched);
}
