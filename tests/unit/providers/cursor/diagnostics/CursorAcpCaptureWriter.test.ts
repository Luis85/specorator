import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { CursorAcpCaptureWriter } from '@/providers/cursor/diagnostics/CursorAcpCaptureWriter';

describe('CursorAcpCaptureWriter', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'specorator-cursor-capture-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('writes redacted wire frames as ordered JSONL', async () => {
    const writer = new CursorAcpCaptureWriter({
      baseDir: tmp,
      meta: { cliVersion: 'x', pluginVersion: 'y', platform: 'linux' },
    });
    await writer.ready;
    writer.wireFrame('client', JSON.stringify({ method: 'authenticate', params: { token: 'sk-abc123secretvalue' } }));
    writer.wireFrame('agent', JSON.stringify({ result: {} }));
    await writer.flush();

    const lines = (await fs.readFile(path.join(writer.sessionDir, 'wire.jsonl'), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).dir).toBe('client');
    expect(lines[0]).not.toContain('sk-abc123secretvalue');
    expect(JSON.parse(lines[1]).dir).toBe('agent');
  });

  it('redacts nested secret keys in parsed wire frames', async () => {
    const writer = new CursorAcpCaptureWriter({
      baseDir: tmp,
      meta: { cliVersion: 'x', pluginVersion: 'y', platform: 'linux' },
    });
    await writer.ready;
    writer.wireFrame(
      'client',
      JSON.stringify({ method: 'session/prompt', params: { api_key: 'sk-live-secret', nested: { token: 'abc' } } }),
    );
    await writer.flush();

    const lines = (await fs.readFile(path.join(writer.sessionDir, 'wire.jsonl'), 'utf8')).trim().split('\n');
    const frame = JSON.parse(lines[0]).frame as string;
    expect(frame).not.toContain('sk-live-secret');
    expect(frame).toContain('[redacted]');
  });

  it('writes lifecycle events and meta.json', async () => {
    const writer = new CursorAcpCaptureWriter({
      baseDir: tmp,
      meta: { cliVersion: '1.2.3', pluginVersion: '4.5.6', platform: 'darwin' },
    });
    await writer.ready;
    writer.event('spawn', { cliPath: '/usr/bin/agent', args: ['acp'] });
    await writer.flush();

    const lifecycleLines = (await fs.readFile(path.join(writer.sessionDir, 'lifecycle.jsonl'), 'utf8'))
      .trim()
      .split('\n');
    expect(lifecycleLines).toHaveLength(1);
    expect(JSON.parse(lifecycleLines[0]).kind).toBe('spawn');

    const meta = JSON.parse(await fs.readFile(path.join(writer.sessionDir, 'meta.json'), 'utf8'));
    expect(meta.cliVersion).toBe('1.2.3');
  });

  it('appends stderr to stderr.log', async () => {
    const writer = new CursorAcpCaptureWriter({
      baseDir: tmp,
      meta: { cliVersion: 'x', pluginVersion: 'y', platform: 'linux' },
    });
    await writer.ready;
    writer.stderr('boom\n');
    await writer.flush();

    const contents = await fs.readFile(path.join(writer.sessionDir, 'stderr.log'), 'utf8');
    expect(contents).toContain('boom');
  });

  it('scrubs secret-shaped substrings out of stderr output', async () => {
    const writer = new CursorAcpCaptureWriter({
      baseDir: tmp,
      meta: { cliVersion: 'x', pluginVersion: 'y', platform: 'linux' },
    });
    await writer.ready;
    writer.stderr('token=sk-abc123secretvalue failed to authenticate\n');
    await writer.flush();

    const contents = await fs.readFile(path.join(writer.sessionDir, 'stderr.log'), 'utf8');
    expect(contents).not.toContain('sk-abc123secretvalue');
  });

  it('prunes to the newest 20 session dirs, including the newly created one', async () => {
    // Pre-create 21 session dirs with sortable, strictly increasing names so
    // pruneOldSessions' lexical-descending sort has an unambiguous chronology.
    const preexisting: string[] = [];
    for (let i = 0; i < 21; i += 1) {
      const name = `20260101-${String(i).padStart(6, '0')}-old${i}`;
      const dir = path.join(tmp, name);
      await fs.mkdir(dir, { recursive: true });
      preexisting.push(dir);
    }

    const writer = new CursorAcpCaptureWriter({
      baseDir: tmp,
      meta: { cliVersion: 'x', pluginVersion: 'y', platform: 'linux' },
      // Force the new session to sort after every pre-existing dir above.
      sessionName: '99999999-999999-new',
    });
    await writer.ready;

    const remaining = await fs.readdir(tmp);
    expect(remaining).toHaveLength(20);
    expect(remaining).toContain('99999999-999999-new');
    // The two oldest pre-existing dirs must have been pruned away.
    expect(remaining).not.toContain('20260101-000000-old0');
    expect(remaining).not.toContain('20260101-000001-old1');
    // The newest pre-existing dirs must survive.
    expect(remaining).toContain(`20260101-${String(20).padStart(6, '0')}-old20`);
  });

  it('disables itself after the first write failure without throwing', async () => {
    // A regular file where a directory segment is expected forces mkdir(recursive)
    // to fail structurally (ENOTDIR) regardless of the running user's permissions
    // (chmod-based denial doesn't hold under root, which CI may run as).
    const blocker = path.join(tmp, 'blocker-file');
    await fs.writeFile(blocker, 'not a directory');
    const baseDir = path.join(blocker, 'captures');

    const onDisabled = jest.fn();
    const writer = new CursorAcpCaptureWriter({
      baseDir,
      meta: { cliVersion: 'x', pluginVersion: 'y', platform: 'linux' },
      onDisabled,
    });

    await expect(writer.ready).resolves.toBeUndefined();
    expect(writer.disabled).toBe(true);
    expect(onDisabled).toHaveBeenCalledTimes(1);

    // Post-disable calls must resolve cleanly and never throw into the caller.
    expect(() => writer.wireFrame('client', '{}')).not.toThrow();
    expect(() => writer.event('spawn')).not.toThrow();
    expect(() => writer.stderr('boom')).not.toThrow();
    await expect(writer.flush()).resolves.toBeUndefined();
  });

  it('does not re-invoke onDisabled after the writer is already disabled', async () => {
    const blocker = path.join(tmp, 'blocker-file-2');
    await fs.writeFile(blocker, 'not a directory');
    const baseDir = path.join(blocker, 'captures');

    const onDisabled = jest.fn();
    const writer = new CursorAcpCaptureWriter({
      baseDir,
      meta: { cliVersion: 'x', pluginVersion: 'y', platform: 'linux' },
      onDisabled,
    });
    await writer.ready;
    writer.wireFrame('client', '{}');
    await writer.flush();
    writer.stderr('boom');
    await writer.flush();

    expect(onDisabled).toHaveBeenCalledTimes(1);
  });
});
