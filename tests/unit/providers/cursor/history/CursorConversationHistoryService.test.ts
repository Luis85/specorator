import * as fs from 'fs';
import type * as osTypes from 'os';
import * as path from 'path';

import type { HydrationContext } from '@/core/providers/types';
import type { Conversation } from '@/core/types';
import { CursorConversationHistoryService } from '@/providers/cursor/history/CursorConversationHistoryService';
import {
  cursorWorkspaceHash,
  cursorWorkspaceHashLegacy,
} from '@/providers/cursor/history/cursorHistoryStore';
import * as Store from '@/providers/cursor/history/cursorHistoryStore';

function makeConversation(sessionId: string): Conversation {
  return {
    id: 'conv-1',
    title: 'Test',
    messages: [],
    createdAt: 0,
    lastActiveAt: 0,
    sessionId: null,
    providerId: 'cursor',
    providerState: { chatSessionId: sessionId },
  } as unknown as Conversation;
}

describe('CursorConversationHistoryService — no out-of-band error getter', () => {
  it('does not expose getLastHistoryLoadError', () => {
    const svc = new CursorConversationHistoryService();
    expect((svc as unknown as { getLastHistoryLoadError?: unknown }).getLastHistoryLoadError).toBeUndefined();
  });

  it('does not expose forkSupport (Cursor capabilities.supportsFork === false)', () => {
    const svc = new CursorConversationHistoryService();
    expect(svc.forkSupport).toBeUndefined();
  });
});

describe('CursorConversationHistoryService.hydrateConversationHistory', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('returns error:sqlite-unavailable when node:sqlite cannot be required', async () => {
    jest.spyOn(Store, 'resolveCursorHistorySources').mockReturnValue([{
      kind: 'acp-sqlite',
      path: '/tmp/cursor.db',
      sourceRef: 's::acp-sqlite::/tmp/cursor.db::1:1',
    }]);
    jest.spyOn(Store, 'loadCursorHistoryFromSources').mockReturnValue({
      messages: [],
      sourceRef: 's::acp-sqlite::/tmp/cursor.db::1:1',
      error: { code: 'sqlite-unavailable', message: 'Cursor history requires Node 22.5+ (node:sqlite).' },
    });
    const svc = new CursorConversationHistoryService();
    const out = await svc.hydrateConversationHistory(makeConversation('s'), {
      vaultPath: '/vault',
      reason: 'open',
    });
    expect(out.kind).toBe('error');
    // eslint-disable-next-line jest/no-conditional-expect
    if (out.kind === 'error') expect(out.error.code).toBe('sqlite-unavailable');
  });

  it('loads Cursor 2.x agent transcript JSONL when the legacy SQLite store is absent', async () => {
    jest.spyOn(Store, 'resolveCursorHistorySources').mockReturnValue([{
      kind: 'jsonl',
      path: '/tmp/session.jsonl',
      sourceRef: 's::jsonl::/tmp/session.jsonl::1:1',
    }]);
    jest.spyOn(Store, 'loadCursorHistoryFromSources').mockReturnValue({
      messages: [{
        id: 'm1',
        role: 'user',
        content: 'restored',
        timestamp: 1,
      }],
      sourceRef: 's::jsonl::/tmp/session.jsonl::1:1',
    });
    const svc = new CursorConversationHistoryService();

    const out = await svc.hydrateConversationHistory(makeConversation('s'), {
      vaultPath: '/vault',
      reason: 'open',
    });

    expect(out).toEqual(expect.objectContaining({
      kind: 'loaded',
      messages: [expect.objectContaining({ content: 'restored' })],
    }));
  });

  it('marks a degraded SQLite/JSONL parse as non-cacheable', async () => {
    jest.spyOn(Store, 'resolveCursorHistorySources').mockReturnValue([{
      kind: 'jsonl',
      path: '/tmp/session.jsonl',
      sourceRef: 's::jsonl::/tmp/session.jsonl::1:1',
    }]);
    jest.spyOn(Store, 'loadCursorHistoryFromSources').mockReturnValue({
      messages: [{
        id: 'm1',
        role: 'user',
        content: 'partial history',
        timestamp: 1,
      }],
      sourceRef: 's::jsonl::/tmp/session.jsonl::1:1',
      degraded: true,
    });
    const svc = new CursorConversationHistoryService();

    const out = await svc.hydrateConversationHistory(makeConversation('s'), {
      vaultPath: '/vault',
      reason: 'open',
    });

    expect(out).toEqual(expect.objectContaining({
      kind: 'loaded',
      cacheable: false,
    }));
  });
});

describe('CursorConversationHistoryService.deleteConversationSession', () => {
  const realOs = jest.requireActual<typeof osTypes>('os');
  let tmpHome: string;
  let homedirSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(realOs.tmpdir(), 'specorator-cursor-delete-'));
    homedirSpy = jest.spyOn(realOs, 'homedir').mockReturnValue(tmpHome);
  });
  afterEach(() => {
    homedirSpy.mockRestore();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function plantChatDir(hash: string, sessionId: string): string {
    const dir = path.join(tmpHome, '.cursor', 'chats', hash, sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'store.db'), '');
    return dir;
  }

  function ctxFor(vaultPath: string): HydrationContext {
    return { vaultPath, reason: 'open' };
  }

  it('falls back to exact-project JSONL when ACP metadata belongs to another vault', async () => {
    const vault = '/vault/Test';
    const sessionId = 'sess-cross-vault-fallback';
    const acpDir = path.join(tmpHome, '.cursor', 'acp-sessions', sessionId);
    fs.mkdirSync(acpDir, { recursive: true });
    fs.writeFileSync(path.join(acpDir, 'meta.json'), JSON.stringify({ cwd: '/other/Vault' }));
    fs.writeFileSync(path.join(acpDir, 'store.db'), '');

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
    fs.writeFileSync(transcript, `${JSON.stringify({
      role: 'user',
      message: { content: [{ type: 'text', text: 'safe fallback' }] },
    })}\n`);

    const svc = new CursorConversationHistoryService();
    const out = await svc.hydrateConversationHistory(makeConversation(sessionId), ctxFor(vault));

    expect(out).toEqual(expect.objectContaining({
      kind: 'loaded',
      messages: [expect.objectContaining({ content: 'safe fallback' })],
    }));
  });

  it('returns deleted with the normalized-hash directory in paths', async () => {
    const vault = '/vault/Test';
    const sessionId = 'sess-normalized';
    const dir = plantChatDir(cursorWorkspaceHash(vault), sessionId);

    const svc = new CursorConversationHistoryService();
    const out = await svc.deleteConversationSession(makeConversation(sessionId), ctxFor(vault));

    expect(out.kind).toBe('deleted');
    // eslint-disable-next-line jest/no-conditional-expect
    if (out.kind === 'deleted') expect(out.paths).toContain(dir);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('also removes the legacy-hash directory and reports both paths', async () => {
    const vault = 'D:\\\\Projects\\\\Test';
    const sessionId = 'sess-legacy';
    const legacyDir = plantChatDir(cursorWorkspaceHashLegacy(vault), sessionId);

    const svc = new CursorConversationHistoryService();
    const out = await svc.deleteConversationSession(makeConversation(sessionId), ctxFor(vault));

    expect(out.kind).toBe('deleted');
    // eslint-disable-next-line jest/no-conditional-expect
    if (out.kind === 'deleted') expect(out.paths).toContain(legacyDir);
    expect(fs.existsSync(legacyDir)).toBe(false);
  });

  it('returns error:invalid-session-id when sessionId fails validation', async () => {
    const vault = '/vault/Test';
    const chatsRoot = path.join(tmpHome, '.cursor', 'chats');
    fs.mkdirSync(chatsRoot, { recursive: true });
    fs.writeFileSync(path.join(chatsRoot, 'sentinel'), '');

    const svc = new CursorConversationHistoryService();
    const out = await svc.deleteConversationSession(makeConversation('.'), ctxFor(vault));

    expect(out.kind).toBe('error');
    // eslint-disable-next-line jest/no-conditional-expect
    if (out.kind === 'error') expect(out.error.code).toBe('invalid-session-id');
    expect(fs.existsSync(path.join(chatsRoot, 'sentinel'))).toBe(true);
  });

  it('refuses to delete an unowned global ACP directory when store.db is absent', async () => {
    const vault = '/vault/Test';
    const sessionId = 'sess-unowned-no-store';
    const acpDir = path.join(tmpHome, '.cursor', 'acp-sessions', sessionId);
    fs.mkdirSync(acpDir, { recursive: true });
    fs.writeFileSync(path.join(acpDir, 'meta.json'), JSON.stringify({ cwd: '/other/Vault' }));

    const svc = new CursorConversationHistoryService();
    const out = await svc.deleteConversationSession(makeConversation(sessionId), ctxFor(vault));

    expect(out.kind).toBe('error');
    expect(fs.existsSync(acpDir)).toBe(true);
  });

  it('returns no-op:no-session when sessionId is null or vaultPath is null', async () => {
    const svc = new CursorConversationHistoryService();
    const conv = { ...makeConversation('s'), providerState: {} } as Conversation;
    const out = await svc.deleteConversationSession(conv, { vaultPath: null, reason: 'open' });
    expect(out).toEqual({ kind: 'no-op', reason: 'no-session' });
  });
});
