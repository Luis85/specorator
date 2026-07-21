import { TOOL_EDIT } from '../../../../src/core/tools/toolNames';
import {
  createOpencodeToolStreamAdapter,
  normalizeOpencodeToolInput,
  normalizeOpencodeToolName,
  resolveOpencodeRawToolName,
} from '../../../../src/providers/opencode/normalization/opencodeToolNormalization';

describe('normalizeOpencodeToolInput', () => {
  it('maps websearch payloads to the WebSearch renderer shape', () => {
    expect(normalizeOpencodeToolInput('websearch', {
      action: {
        queries: [
          'obsidian plugin API',
          'obsidian docs',
          'obsidian plugin API',
        ],
      },
    })).toEqual({
      actionType: 'search',
      query: 'obsidian plugin API',
      queries: [
        'obsidian plugin API',
        'obsidian docs',
      ],
    });
  });

  it('maps question payloads to the AskUserQuestion renderer shape', () => {
    expect(normalizeOpencodeToolInput('question', {
      questions: [{
        header: 'Tests',
        id: 'tests',
        multiple: true,
        options: [
          { description: 'Update the related tests', label: 'Yes' },
          { description: 'Skip test edits', label: 'No' },
        ],
        question: 'Update tests too?',
      }],
    })).toEqual({
      questions: [{
        header: 'Tests',
        id: 'tests',
        multiSelect: true,
        options: [
          { description: 'Update the related tests', label: 'Yes' },
          { description: 'Skip test edits', label: 'No' },
        ],
        question: 'Update tests too?',
      }],
    });
  });

  it('maps todowrite statuses into the TodoWrite renderer shape', () => {
    expect(normalizeOpencodeToolInput('todowrite', {
      todos: [
        { content: 'Ship feature', status: 'in_progress' },
        { content: 'Drop stale task', status: 'cancelled' },
      ],
    })).toEqual({
      todos: [
        { activeForm: 'Ship feature', content: 'Ship feature', status: 'in_progress' },
        { activeForm: 'Drop stale task', content: 'Drop stale task', status: 'completed' },
      ],
    });
  });
});

describe('createOpencodeToolStreamAdapter', () => {
  it('keeps the original tool identity when completion updates replace title with a filepath', () => {
    const adapter = createOpencodeToolStreamAdapter();

    expect(adapter.normalizeToolCall({
      rawInput: {},
      title: 'read',
      toolCallId: 'tool-1',
    }, [{
      id: 'tool-1',
      input: {},
      name: 'read',
      type: 'tool_use',
    }])).toEqual([{
      id: 'tool-1',
      input: {},
      name: 'Read',
      type: 'tool_use',
    }]);

    expect(adapter.normalizeToolCallUpdate({
      kind: 'read',
      rawInput: {
        filePath: '/vault/notes/today.md',
      },
      status: 'completed',
      title: 'notes/today.md',
      toolCallId: 'tool-1',
    }, [{
      content: 'read ok',
      id: 'tool-1',
      isError: false,
      type: 'tool_result',
    }])).toEqual([
      {
        id: 'tool-1',
        input: { file_path: '/vault/notes/today.md' },
        name: 'Read',
        type: 'tool_use',
      },
      {
        content: 'read ok',
        id: 'tool-1',
        isError: false,
        type: 'tool_result',
      },
    ]);
  });

  it('attaches structured answers for question tool results', () => {
    const adapter = createOpencodeToolStreamAdapter();

    adapter.normalizeToolCall({
      rawInput: {
        questions: [{
          header: 'Deploy',
          id: 'deploy',
          options: [
            { description: 'Ship the change', label: 'Yes' },
            { description: 'Hold the deploy', label: 'No' },
          ],
          question: 'Deploy now?',
        }],
      },
      title: 'question',
      toolCallId: 'tool-2',
    }, [{
      id: 'tool-2',
      input: {},
      name: 'question',
      type: 'tool_use',
    }]);

    expect(adapter.normalizeToolCallUpdate({
      rawOutput: {
        metadata: {
          answers: [['Yes']],
        },
        output: 'User has answered your questions.',
      },
      status: 'completed',
      title: 'Asked 1 question',
      toolCallId: 'tool-2',
    }, [{
      content: 'User has answered your questions.',
      id: 'tool-2',
      isError: false,
      type: 'tool_result',
    }])).toEqual([{
      content: 'User has answered your questions.',
      id: 'tool-2',
      isError: false,
      toolUseResult: {
        answers: {
          deploy: 'Yes',
          'Deploy now?': 'Yes',
        },
      },
      type: 'tool_result',
    }]);
  });

  it('normalizes websearch tool calls to the shared WebSearch renderer contract', () => {
    const adapter = createOpencodeToolStreamAdapter();

    expect(adapter.normalizeToolCall({
      rawInput: {
        action: {
          pattern: 'tools',
          url: 'https://example.com/docs',
        },
      },
      title: 'websearch',
      toolCallId: 'tool-3',
    }, [{
      id: 'tool-3',
      input: {},
      name: 'websearch',
      type: 'tool_use',
    }])).toEqual([{
      id: 'tool-3',
      input: {
        actionType: 'find_in_page',
        pattern: 'tools',
        url: 'https://example.com/docs',
      },
      name: 'WebSearch',
      type: 'tool_use',
    }]);
  });

  it('resolves an edit whose title is prose to the canonical Edit tool', () => {
    const adapter = createOpencodeToolStreamAdapter();

    expect(adapter.normalizeToolCall({
      kind: 'edit',
      rawInput: { filePath: '/vault/notes/today.md' },
      title: 'Applying changes',
      toolCallId: 'tool-4',
    }, [{
      id: 'tool-4',
      input: {},
      name: 'edit',
      type: 'tool_use',
    }])).toEqual([{
      id: 'tool-4',
      input: { file_path: '/vault/notes/today.md' },
      name: 'Edit',
      type: 'tool_use',
    }]);
  });
});

describe('resolveOpencodeRawToolName', () => {
  it('resolves the edit kind when the title is prose (not a known tool name)', () => {
    expect(resolveOpencodeRawToolName(undefined, { kind: 'edit', title: 'Applying changes' })).toBe('edit');
    expect(normalizeOpencodeToolName(
      resolveOpencodeRawToolName(undefined, { kind: 'edit', title: 'Applying changes' }),
    )).toBe(TOOL_EDIT);
  });

  it('resolves the edit kind when no title is present', () => {
    expect(resolveOpencodeRawToolName(undefined, { kind: 'edit' })).toBe('edit');
  });

  it('still prefers a known tool name in the title over the kind', () => {
    expect(resolveOpencodeRawToolName(undefined, { kind: 'edit', title: 'write' })).toBe('write');
  });

  it('keeps resolving the previously mapped read/execute/fetch kinds', () => {
    expect(resolveOpencodeRawToolName(undefined, { kind: 'read' })).toBe('read');
    expect(resolveOpencodeRawToolName(undefined, { kind: 'execute' })).toBe('bash');
    expect(resolveOpencodeRawToolName(undefined, { kind: 'fetch' })).toBe('webfetch');
  });

  it('lets a later edit kind correct a name first pinned to a prose title', () => {
    // Initial call: prose title, no kind → currentRawName becomes the prose text.
    const first = resolveOpencodeRawToolName(undefined, { title: 'Applying changes' });
    expect(first).toBe('Applying changes');
    // A later update supplying the semantic edit kind must correct the id, not
    // stay short-circuited on the prose name — otherwise the file stays hidden.
    expect(resolveOpencodeRawToolName(first, { kind: 'edit' })).toBe('edit');
    expect(normalizeOpencodeToolName(resolveOpencodeRawToolName(first, { kind: 'edit' }))).toBe(TOOL_EDIT);
  });

  it('keeps a resolved known current name pinned when a later prose title arrives', () => {
    expect(resolveOpencodeRawToolName('read', { title: 'notes/today.md' })).toBe('read');
  });
});
