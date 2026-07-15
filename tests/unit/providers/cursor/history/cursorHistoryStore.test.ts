import * as crypto from 'crypto';
import * as fs from 'fs';
import type * as osType from 'os';
import * as path from 'path';

const os = jest.requireActual<typeof osType>('os');

import { TOOL_READ, TOOL_WRITE } from '@/core/tools/toolNames';
import { getToolSummary } from '@/features/chat/rendering/toolCallViewModel';
import {
  buildChatMessagesFromCursorAgentTranscript,
  buildChatMessagesFromCursorHistoryRecords,
  classifyCursorSqliteOpenError,
  cursorWorkspaceHash,
  cursorWorkspaceHashLegacy,
  loadCursorChatMessagesFromStoreResult,
  loadCursorHistoryFromSources,
  resolveCursorAgentTranscriptPath,
  resolveCursorHistorySources,
  resolveCursorStoreDbPath,
  validateCursorAcpSessionVault,
} from '@/providers/cursor/history/cursorHistoryStore';

describe('cursorHistoryStore', () => {
  it('legacy hash matches raw md5 of workspace path (pre-normalization Cursor CLI behavior)', () => {
    const vaultPath = '/tmp/specorator-test-vault-path';
    expect(cursorWorkspaceHashLegacy(vaultPath)).toBe(
      crypto.createHash('md5').update(vaultPath).digest('hex'),
    );
  });
});

describe('buildChatMessagesFromCursorHistoryRecords', () => {
  it('normalizes tool-call and tool-result blobs like the live stream mapper', () => {
    const messages = buildChatMessagesFromCursorHistoryRecords([
      {
        rowId: 'user-1',
        record: { role: 'user', content: 'Please update README' },
      },
      {
        rowId: 'asst-1',
        record: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Reading first.' },
            {
              type: 'tool-call',
              toolCallId: 'tc-read',
              toolName: 'readToolCall',
              args: { path: 'README.md' },
            },
          ],
        },
      },
      {
        rowId: 'tool-1',
        record: {
          role: 'tool',
          content: [{
            type: 'tool-result',
            toolCallId: 'tc-read',
            result: { success: { content: '# Title' } },
          }],
        },
      },
      {
        rowId: 'asst-2',
        record: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Editing now.' },
            {
              type: 'tool-call',
              toolCallId: 'tc-edit',
              toolName: 'editToolCall',
              args: { path: 'README.md', streamContent: '# Title\n\nBody' },
            },
          ],
        },
      },
      {
        rowId: 'tool-2',
        record: {
          role: 'tool',
          content: [{
            type: 'tool-result',
            toolCallId: 'tc-edit',
            result: {
              success: {
                path: 'README.md',
                message: 'Updated',
                diffString: '@@ -1 +2 @@\n-# Title\n+# Title\n+\n+Body',
              },
            },
          }],
        },
      },
    ]);

    expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'assistant']);
    expect(messages[0].content).toBe('Please update README');

    const readAssistant = messages[1];
    expect(readAssistant.toolCalls?.[0]).toMatchObject({
      id: 'tc-read',
      name: TOOL_READ,
      input: { file_path: 'README.md' },
      status: 'completed',
      result: '# Title',
    });

    const editAssistant = messages[2];
    expect(editAssistant.toolCalls?.[0]).toMatchObject({
      id: 'tc-edit',
      name: TOOL_WRITE,
      input: { file_path: 'README.md', content: '# Title\n\nBody' },
      status: 'completed',
    });
    expect(editAssistant.toolCalls?.[0]?.diffData?.filePath).toBe('README.md');
    expect(editAssistant.toolCalls?.[0]?.diffData?.diffLines.length).toBeGreaterThan(0);
  });

  it('synthesizes deterministic tool-call ids when blobs omit ids', () => {
    const messages = buildChatMessagesFromCursorHistoryRecords([
      {
        rowId: 'user-1',
        record: { role: 'user', content: 'run tool' },
      },
      {
        rowId: 'asst-1',
        record: {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'readToolCall',
              args: { path: 'README.md' },
            },
          ],
        },
      },
      {
        rowId: 'tool-1',
        record: {
          role: 'tool',
          content: [{
            type: 'tool-result',
            result: { success: { content: '# Title' } },
          }],
        },
      },
    ]);

    expect(messages).toHaveLength(2);
    const toolId = messages[1].toolCalls?.[0]?.id;
    expect(toolId).toMatch(/^cursor-tc-[a-f0-9]{16}$/);
    expect(messages[1].toolCalls?.[0]?.status).toBe('completed');
  });

  it('skips IDE bootstrap user blobs', () => {
    const messages = buildChatMessagesFromCursorHistoryRecords([
      {
        rowId: 'boot',
        record: { role: 'user', content: '<user_info>secret</user_info>' },
      },
      {
        rowId: 'real',
        record: { role: 'user', content: 'hello' },
      },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('hello');
  });

  it('assigns strictly increasing timestamps so messages sort by order, not one instant', () => {
    // Cursor blobs carry no timestamp, so hydration synthesizes a monotonic
    // sequence from a base time rather than stamping every message with an
    // identical Date.now() (which collapses any time-based ordering/grouping).
    const messages = buildChatMessagesFromCursorHistoryRecords(
      [
        { rowId: 'u1', record: { role: 'user', content: 'first' } },
        { rowId: 'a1', record: { role: 'assistant', content: 'second' } },
        { rowId: 'u2', record: { role: 'user', content: 'third' } },
      ],
      1_000,
    );

    expect(messages.map((m) => m.timestamp)).toEqual([1_000, 1_001, 1_002]);
    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
    expect(sorted.map((m) => m.content)).toEqual(['first', 'second', 'third']);
  });
});

describe('buildChatMessagesFromCursorAgentTranscript', () => {
  it('loads user and assistant text from Cursor 2.x JSONL records', () => {
    const messages = buildChatMessagesFromCursorAgentTranscript([
      JSON.stringify({
        role: 'user',
        message: {
          content: [{
            type: 'text',
            text: '<timestamp>Now</timestamp>\n<user_query>\nLoad this conversation\n</user_query>',
          }],
        },
      }),
      JSON.stringify({
        role: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Loaded response' },
            { type: 'tool_use', name: 'ReadFile', input: { path: 'README.md' } },
          ],
        },
      }),
      JSON.stringify({ type: 'turn_ended', status: 'success' }),
      '{ malformed',
    ], 1_000);

    expect(messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Load this conversation',
        timestamp: 1_000,
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Loaded response',
        timestamp: 1_001,
      }),
    ]);
  });

  it('loads string message content and real tool_use/tool_result block names', () => {
    const messages = buildChatMessagesFromCursorAgentTranscript([
      JSON.stringify({
        role: 'user',
        message: { content: '<user_query>Read the file</user_query>' },
      }),
      JSON.stringify({
        role: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'tc-real-read',
            name: 'readToolCall',
            input: { path: 'README.md' },
          }],
        },
      }),
      JSON.stringify({
        role: 'tool',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'tc-real-read',
            content: '# Real transcript',
          }],
        },
      }),
    ], 2_000);

    expect(messages[0]).toMatchObject({
      role: 'user',
      content: 'Read the file',
    });
    expect(messages[1]?.toolCalls?.[0]).toMatchObject({
      id: 'tc-real-read',
      name: TOOL_READ,
      status: 'completed',
      result: '# Real transcript',
    });
  });
});

describe('cursorWorkspaceHash (normalized)', () => {
  const realPlatform = process.platform;
  function setPlatform(p: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: p, configurable: true });
  }
  afterEach(() => setPlatform(realPlatform));

  it('produces the same hash for differently-cased Windows paths', () => {
    setPlatform('win32');
    expect(cursorWorkspaceHash('D:\\Projects\\Specorator'))
      .toBe(cursorWorkspaceHash('d:\\projects\\specorator'));
  });

  it('keeps POSIX paths case-sensitive', () => {
    setPlatform('linux');
    expect(cursorWorkspaceHash('/home/user/Vault'))
      .not.toBe(cursorWorkspaceHash('/home/user/vault'));
  });

  it('normalizes trailing slashes', () => {
    setPlatform('linux');
    expect(cursorWorkspaceHash('/home/user/vault'))
      .toBe(cursorWorkspaceHash('/home/user/vault/'));
  });
});

describe('loadCursorChatMessagesFromStoreResult', () => {
  it('returns an error when the database cannot be opened', () => {
    const result = loadCursorChatMessagesFromStoreResult('/definitely/does/not/exist.db');
    expect(result.messages).toEqual([]);
    expect(result.error).toBeDefined();
    // After Task 5 the open path emits a structured HistoryLoadError.
    expect(typeof result.error).toBe('object');
    // eslint-disable-next-line jest/no-conditional-expect
    if (result.error && typeof result.error === 'object') expect(result.error.code).toBe('store-unreadable');
  });

  it('does not leak the home directory through the structured error', () => {
    const home = os.homedir();
    const dbPath = `${home}/.cursor/chats/abc/xyz/store.db`;
    const result = loadCursorChatMessagesFromStoreResult(dbPath);
    expect(result.error).toBeDefined();
    // Structured error: HOME must not leak through the user-facing message OR
    // the debug-only detail field that the leveled logger consumes. Detail
    // passes through `redactHomeInPath` before reaching callers; the underlying
    // node:sqlite open error doesn't always embed the path itself (depends on
    // Node build), so we assert non-leak rather than the sentinel presence.
    const err = result.error;
    if (err && typeof err === 'object') {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(err.message).not.toContain(home);
      // eslint-disable-next-line jest/no-conditional-expect
      expect(err.detail ?? '').not.toContain(home);
    } else {
      // Legacy string path (kept for SQL-read inline failures).
      // eslint-disable-next-line jest/no-conditional-expect
      expect(err).not.toContain(home);
      // eslint-disable-next-line jest/no-conditional-expect
      expect(err).toContain('[HOME]');
    }
  });
});

describe('classifyCursorSqliteOpenError', () => {
  it("maps Node's unknown-builtin-module error to sqlite-unavailable", () => {
    // Node 20 throws this when require('node:sqlite') hits the flagged builtin.
    const err = Object.assign(new Error('No such built-in module: node:sqlite'), {
      code: 'ERR_UNKNOWN_BUILTIN_MODULE',
    });
    expect(classifyCursorSqliteOpenError(err).code).toBe('sqlite-unavailable');
  });

  it('maps a missing-module error to sqlite-unavailable', () => {
    const err = Object.assign(new Error("Cannot find module 'node:sqlite'"), {
      code: 'MODULE_NOT_FOUND',
    });
    expect(classifyCursorSqliteOpenError(err).code).toBe('sqlite-unavailable');
  });

  it('classifies other open failures as store-unreadable with the home dir redacted', () => {
    const home = os.homedir();
    const err = new Error(`unable to open ${home}/.cursor/chats/abc/store.db`);
    const result = classifyCursorSqliteOpenError(err);
    expect(result.code).toBe('store-unreadable');
    expect(result.message).not.toContain(home);
    expect(result.detail ?? '').not.toContain(home);
  });
});

describe('resolveCursorStoreDbPath two-hash fallback', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'specorator-test-home-'));
  let homedirSpy: jest.SpyInstance;
  beforeAll(() => { homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tmpHome); });
  afterAll(() => {
    homedirSpy.mockRestore();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('prefers the current Cursor ACP session store', () => {
    const sessionId = 'session-acp';
    const acpStore = path.join(
      tmpHome,
      '.cursor',
      'acp-sessions',
      sessionId,
      'store.db',
    );
    fs.mkdirSync(path.dirname(acpStore), { recursive: true });
    fs.writeFileSync(
      path.join(path.dirname(acpStore), 'meta.json'),
      JSON.stringify({ cwd: '/vault/Test' }),
    );
    fs.writeFileSync(acpStore, '');

    expect(resolveCursorStoreDbPath('/vault/Test', sessionId)).toBe(acpStore);
  });

  it('falls back to the legacy hash when the normalized hash has no store', () => {
    const vault = 'D:\\Projects\\Specorator';
    const legacy = cursorWorkspaceHashLegacy(vault);
    const legacyDir = path.join(tmpHome, '.cursor', 'chats', legacy, 'sess-123');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'store.db'), '');

    const resolved = resolveCursorStoreDbPath(vault, 'sess-123');
    expect(resolved).toBe(path.join(legacyDir, 'store.db'));
  });

  it('resolves Cursor 2.x project-scoped agent transcripts', () => {
    const vault = '/vault/Test';
    const sessionId = 'session-123';
    const slug = path.resolve(vault).replace(/[:\\/]+/g, '-');
    const transcript = path.join(
      tmpHome,
      '.cursor',
      'projects',
      slug,
      'agent-transcripts',
      sessionId,
      `${sessionId}.jsonl`,
    );
    fs.mkdirSync(path.dirname(transcript), { recursive: true });
    fs.writeFileSync(transcript, '');

    expect(resolveCursorAgentTranscriptPath(vault, sessionId)).toBe(transcript);
  });

  it('rejects ACP sessions whose meta.json cwd does not match the vault', () => {
    const sessionId = 'session-vault-mismatch';
    const acpDir = path.join(tmpHome, '.cursor', 'acp-sessions', sessionId);
    fs.mkdirSync(acpDir, { recursive: true });
    fs.writeFileSync(path.join(acpDir, 'meta.json'), JSON.stringify({ cwd: 'C:\\\\Other\\\\Vault' }));
    fs.writeFileSync(path.join(acpDir, 'store.db'), '');

    expect(resolveCursorHistorySources('/vault/Test', sessionId)).toEqual([]);
    expect(validateCursorAcpSessionVault(sessionId, '/vault/Test')?.code).toBe('vault-mismatch');
  });

  it('rejects ACP stores whose ownership metadata is missing', () => {
    const sessionId = 'session-missing-meta';
    const acpDir = path.join(tmpHome, '.cursor', 'acp-sessions', sessionId);
    fs.mkdirSync(acpDir, { recursive: true });
    fs.writeFileSync(path.join(acpDir, 'store.db'), '');

    expect(resolveCursorHistorySources('/vault/Test', sessionId)).toEqual([]);
    expect(validateCursorAcpSessionVault(sessionId, '/vault/Test')?.code)
      .toBe('store-unreadable');
  });

  it('rejects a global ACP session directory without store.db when ownership metadata is missing', () => {
    const sessionId = 'session-dir-without-store-or-meta';
    fs.mkdirSync(path.join(tmpHome, '.cursor', 'acp-sessions', sessionId), { recursive: true });

    expect(validateCursorAcpSessionVault(sessionId, '/vault/Test')?.code)
      .toBe('store-unreadable');
  });

  it('rejects mismatched ACP metadata even when store.db is absent', () => {
    const sessionId = 'session-meta-without-store';
    const acpDir = path.join(tmpHome, '.cursor', 'acp-sessions', sessionId);
    fs.mkdirSync(acpDir, { recursive: true });
    fs.writeFileSync(path.join(acpDir, 'meta.json'), JSON.stringify({ cwd: '/other/Vault' }));

    expect(validateCursorAcpSessionVault(sessionId, '/vault/Test')?.code)
      .toBe('vault-mismatch');
  });

  it('accepts matching ACP ownership metadata even when store.db is absent', () => {
    const sessionId = 'session-owned-meta-without-store';
    const acpDir = path.join(tmpHome, '.cursor', 'acp-sessions', sessionId);
    fs.mkdirSync(acpDir, { recursive: true });
    fs.writeFileSync(path.join(acpDir, 'meta.json'), JSON.stringify({ cwd: '/vault/Test' }));

    expect(validateCursorAcpSessionVault(sessionId, '/vault/Test')).toBeNull();
  });

  it('orders sources as ACP sqlite, legacy sqlite, then exact-project JSONL', () => {
    const vault = '/vault/Test';
    const sessionId = 'session-order';
    const acpStore = path.join(tmpHome, '.cursor', 'acp-sessions', sessionId, 'store.db');
    fs.mkdirSync(path.dirname(acpStore), { recursive: true });
    fs.writeFileSync(path.join(path.dirname(acpStore), 'meta.json'), JSON.stringify({ cwd: vault }));
    fs.writeFileSync(acpStore, 'db');

    const legacyDir = path.join(
      tmpHome,
      '.cursor',
      'chats',
      cursorWorkspaceHash(vault),
      sessionId,
    );
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'store.db'), 'legacy');

    const slug = path.resolve(vault).replace(/[:\\/]+/g, '-');
    const transcript = path.join(
      tmpHome,
      '.cursor',
      'projects',
      slug,
      'agent-transcripts',
      sessionId,
      `${sessionId}.jsonl`,
    );
    fs.mkdirSync(path.dirname(transcript), { recursive: true });
    fs.writeFileSync(transcript, '[]');

    const sources = resolveCursorHistorySources(vault, sessionId);
    expect(sources.map((source) => source.kind)).toEqual(['acp-sqlite', 'legacy-sqlite', 'jsonl']);
  });

  it('changes the ACP source identity when the WAL generation changes', () => {
    const vault = '/vault/Test';
    const sessionId = 'session-wal-generation';
    const acpDir = path.join(tmpHome, '.cursor', 'acp-sessions', sessionId);
    const dbPath = path.join(acpDir, 'store.db');
    fs.mkdirSync(acpDir, { recursive: true });
    fs.writeFileSync(path.join(acpDir, 'meta.json'), JSON.stringify({ cwd: vault }));
    fs.writeFileSync(dbPath, 'db');

    const before = resolveCursorHistorySources(vault, sessionId)[0]?.sourceRef;
    fs.writeFileSync(`${dbPath}-wal`, 'wal mutation');
    const after = resolveCursorHistorySources(vault, sessionId)[0]?.sourceRef;

    expect(after).not.toBe(before);
  });

  it('treats a later readable empty fallback as authoritative over an earlier error', () => {
    const badDb = path.join(tmpHome, 'bad-store.db');
    const emptyJsonl = path.join(tmpHome, 'empty.jsonl');
    fs.writeFileSync(badDb, 'not sqlite');
    fs.writeFileSync(emptyJsonl, '');

    const result = loadCursorHistoryFromSources([
      { kind: 'legacy-sqlite', path: badDb, sourceRef: 'bad-db' },
      { kind: 'jsonl', path: emptyJsonl, sourceRef: 'empty-jsonl' },
    ]);

    expect(result).toEqual({
      messages: [],
      sourceRef: 'empty-jsonl',
    });
  });

  it('prefers a later clean source over a degraded partial parse', () => {
    const degradedJsonl = path.join(tmpHome, 'degraded.jsonl');
    const cleanJsonl = path.join(tmpHome, 'clean.jsonl');
    fs.writeFileSync(
      degradedJsonl,
      `${JSON.stringify({
        role: 'user',
        message: { content: [{ type: 'text', text: 'partial' }] },
      })}\n{ malformed`,
    );
    fs.writeFileSync(
      cleanJsonl,
      `${JSON.stringify({
        role: 'user',
        message: { content: [{ type: 'text', text: 'complete' }] },
      })}\n`,
    );

    const result = loadCursorHistoryFromSources([
      { kind: 'jsonl', path: degradedJsonl, sourceRef: 'degraded' },
      { kind: 'jsonl', path: cleanJsonl, sourceRef: 'clean' },
    ]);

    expect(result.sourceRef).toBe('clean');
    expect(result.degraded).toBeUndefined();
    expect(result.messages[0]?.content).toBe('complete');
  });
});

describe('buildChatMessagesFromCursorAgentTranscript tool blocks', () => {
  it('normalizes current tool_use name/input blocks for transcript summaries', () => {
    const messages = buildChatMessagesFromCursorAgentTranscript([
      JSON.stringify({
        role: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tc-read',
              name: 'ReadFile',
              input: { path: 'src/main.ts' },
            },
            {
              type: 'tool_use',
              id: 'tc-find',
              name: 'Find',
              input: { query: 'hydrateConversationHistory', path: 'src/providers' },
            },
          ],
        },
      }),
    ]);

    const toolCalls = messages[0]?.toolCalls ?? [];
    expect(toolCalls).toHaveLength(2);
    expect(getToolSummary(toolCalls[0].name, toolCalls[0].input)).toBe('main.ts');
    expect(getToolSummary(toolCalls[1].name, toolCalls[1].input))
      .toBe('hydrateConversationHistory');
  });

  it('preserves and resolves tool-only turns using canonical tool normalization', () => {
    const messages = buildChatMessagesFromCursorAgentTranscript([
      JSON.stringify({
        role: 'assistant',
        message: {
          content: [{
            type: 'tool-call',
            toolCallId: 'tc-read',
            toolName: 'readToolCall',
            args: { path: 'README.md' },
          }],
        },
      }),
      JSON.stringify({
        role: 'tool',
        message: {
          content: [{
            type: 'tool-result',
            toolCallId: 'tc-read',
            toolName: 'readToolCall',
            result: { success: { content: '# Title' } },
          }],
        },
      }),
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.toolCalls?.[0]?.name).toBe(TOOL_READ);
    expect(messages[0]?.toolCalls?.[0]?.status).toBe('completed');
    expect(messages[0]?.toolCalls?.[0]?.result).toContain('# Title');
  });
});
