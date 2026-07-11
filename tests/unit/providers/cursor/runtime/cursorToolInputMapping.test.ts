import { mapCursorToolInput } from '@/providers/cursor/runtime/cursorToolInputMapping';

// `normalizeTodosArg` is private; it's exercised indirectly through the
// `updateTodosToolCall` / `readTodosToolCall` mappers, which is how
// production code reaches it (see `mapTodosInput` in cursorToolInputMapping.ts).
describe('mapCursorToolInput — todos mapping', () => {
  it('maps a well-formed todos array, preserving id/content/activeForm/status', () => {
    const result = mapCursorToolInput(
      'updateTodosToolCall',
      {
        todos: [
          { id: '1', content: 'Write tests', activeForm: 'Writing tests', status: 'in_progress' },
          { id: '2', content: 'Ship it', activeForm: 'Shipping it', status: 'completed' },
        ],
      },
      undefined,
    );

    expect(result).toEqual({
      todos: [
        { id: '1', content: 'Write tests', activeForm: 'Writing tests', status: 'in_progress' },
        { id: '2', content: 'Ship it', activeForm: 'Shipping it', status: 'completed' },
      ],
    });
  });

  it('defaults activeForm to content and status to pending when missing', () => {
    const result = mapCursorToolInput(
      'updateTodosToolCall',
      { todos: [{ content: 'Review PR' }] },
      undefined,
    );

    expect(result).toEqual({
      todos: [{ id: '', content: 'Review PR', activeForm: 'Review PR', status: 'pending' }],
    });
  });

  it('falls back through title, step, and text for the todo text field', () => {
    const result = mapCursorToolInput(
      'updateTodosToolCall',
      {
        todos: [
          { title: 'From title' },
          { step: 'From step' },
          { text: 'From text' },
        ],
      },
      undefined,
    );

    expect(result.todos).toEqual([
      { id: '', content: 'From title', activeForm: 'From title', status: 'pending' },
      { id: '', content: 'From step', activeForm: 'From step', status: 'pending' },
      { id: '', content: 'From text', activeForm: 'From text', status: 'pending' },
    ]);
  });

  it('skips non-object entries and entries with no usable text field', () => {
    const result = mapCursorToolInput(
      'updateTodosToolCall',
      {
        todos: [
          'not an object',
          null,
          42,
          { status: 'pending' }, // no content/title/step/text — dropped
          { content: 'Kept item' },
        ],
      },
      undefined,
    );

    expect(result.todos).toEqual([
      { id: '', content: 'Kept item', activeForm: 'Kept item', status: 'pending' },
    ]);
  });

  it('falls back to args.plan when args.todos is not an array', () => {
    const result = mapCursorToolInput(
      'updateTodosToolCall',
      { plan: [{ content: 'Plan item one' }] },
      undefined,
    );

    expect(result.todos).toEqual([
      { id: '', content: 'Plan item one', activeForm: 'Plan item one', status: 'pending' },
    ]);
  });

  it('prefers args.todos over args.plan when both are present', () => {
    const result = mapCursorToolInput(
      'updateTodosToolCall',
      {
        todos: [{ content: 'From todos' }],
        plan: [{ content: 'From plan' }],
      },
      undefined,
    );

    expect(result.todos).toEqual([
      { id: '', content: 'From todos', activeForm: 'From todos', status: 'pending' },
    ]);
  });

  it('returns an empty todos array when neither todos nor plan is an array', () => {
    expect(mapCursorToolInput('updateTodosToolCall', {}, undefined)).toEqual({ todos: [] });
    expect(mapCursorToolInput('updateTodosToolCall', { todos: 'nope', plan: 'nope' }, undefined)).toEqual({
      todos: [],
    });
  });

  it('routes readTodosToolCall through the same normalizer', () => {
    const result = mapCursorToolInput(
      'readTodosToolCall',
      { todos: [{ content: 'Read path' }] },
      undefined,
    );

    expect(result).toEqual({
      todos: [{ id: '', content: 'Read path', activeForm: 'Read path', status: 'pending' }],
    });
  });
});
