import { CursorAcpCaptureSink } from '@/providers/cursor/diagnostics/CursorAcpCaptureSink';
import { CursorAcpCaptureWriter } from '@/providers/cursor/diagnostics/CursorAcpCaptureWriter';
import { getCursorProviderSettings } from '@/providers/cursor/settings';
import { getVaultPath } from '@/utils/path';

jest.mock('@/providers/cursor/diagnostics/CursorAcpCaptureWriter', () => ({
  CursorAcpCaptureWriter: jest.fn().mockImplementation(() => ({
    event: jest.fn(),
    stderr: jest.fn(),
    wireFrame: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@/providers/cursor/settings', () => ({ getCursorProviderSettings: jest.fn() }));
jest.mock('@/utils/path', () => ({ getVaultPath: jest.fn() }));

const WriterMock = CursorAcpCaptureWriter as unknown as jest.Mock;
const settingsMock = getCursorProviderSettings as unknown as jest.Mock;
const vaultMock = getVaultPath as unknown as jest.Mock;

function makePlugin(): never {
  return {
    settings: {},
    app: {},
    manifest: { version: '9.9.9' },
    logger: { scope: () => ({ warn: jest.fn() }) },
  } as never;
}

/** The most recently constructed mock writer instance. */
function lastWriter(): { event: jest.Mock; stderr: jest.Mock; wireFrame: jest.Mock; flush: jest.Mock } {
  const results = WriterMock.mock.results;
  return results[results.length - 1]?.value;
}

beforeEach(() => {
  WriterMock.mockClear();
  settingsMock.mockReset();
  vaultMock.mockReset();
  vaultMock.mockReturnValue('/vault');
  settingsMock.mockReturnValue({ captureAcpTraffic: false });
});

describe('CursorAcpCaptureSink.build', () => {
  it('builds no writer and no-ops events when capture is off', () => {
    settingsMock.mockReturnValue({ captureAcpTraffic: false });
    const sink = new CursorAcpCaptureSink(makePlugin());
    sink.build('/bin/cursor-agent');
    sink.event('spawn', { a: 1 });
    expect(WriterMock).not.toHaveBeenCalled();
  });

  it('builds no writer when the vault path is unavailable (headless)', () => {
    settingsMock.mockReturnValue({ captureAcpTraffic: true });
    vaultMock.mockReturnValue(null);
    const sink = new CursorAcpCaptureSink(makePlugin());
    sink.build('/bin/cursor-agent');
    expect(WriterMock).not.toHaveBeenCalled();
  });

  it('builds a writer under captures/cursor and threads spawn meta when capture is on', () => {
    settingsMock.mockReturnValue({ captureAcpTraffic: true });
    const sink = new CursorAcpCaptureSink(makePlugin());
    sink.build('/bin/cursor-agent');
    expect(WriterMock).toHaveBeenCalledTimes(1);
    const opts = WriterMock.mock.calls[0][0] as { baseDir: string; meta: Record<string, unknown> };
    expect(opts.baseDir.replace(/\\/g, '/')).toContain('/captures/cursor');
    expect(opts.meta.cliVersion).toBe('/bin/cursor-agent');
    expect(opts.meta.pluginVersion).toBe('9.9.9');
  });

  it('allocates a distinct session name for repeated writers in one sink', () => {
    // The ++sequence guarantees repeated spawns never collide on a capture dir.
    settingsMock.mockReturnValue({ captureAcpTraffic: true });
    const sink = new CursorAcpCaptureSink(makePlugin());
    sink.build('/bin/cursor-agent');
    sink.build('/bin/cursor-agent');
    expect(WriterMock).toHaveBeenCalledTimes(2);
    const name1 = (WriterMock.mock.calls[0][0] as { sessionName: string }).sessionName;
    const name2 = (WriterMock.mock.calls[1][0] as { sessionName: string }).sessionName;
    expect(name1).not.toBe(name2);
  });

  it('fans event/stderr/wireFrame into the active writer', () => {
    settingsMock.mockReturnValue({ captureAcpTraffic: true });
    const sink = new CursorAcpCaptureSink(makePlugin());
    sink.build('/bin/cursor-agent');
    sink.event('spawn', { cliPath: 'x' });
    sink.stderr('boom');
    sink.wireFrame('agent', '{"jsonrpc":"2.0"}');
    const writer = lastWriter();
    expect(writer.event).toHaveBeenCalledWith('spawn', { cliPath: 'x' });
    expect(writer.stderr).toHaveBeenCalledWith('boom');
    expect(writer.wireFrame).toHaveBeenCalledWith('agent', '{"jsonrpc":"2.0"}');
  });
});

describe('CursorAcpCaptureSink.reconcile', () => {
  it('builds the writer when capture is newly enabled', async () => {
    settingsMock.mockReturnValue({ captureAcpTraffic: false });
    const sink = new CursorAcpCaptureSink(makePlugin());
    sink.build('/bin/cursor-agent'); // off → no writer
    expect(WriterMock).not.toHaveBeenCalled();

    settingsMock.mockReturnValue({ captureAcpTraffic: true });
    await sink.reconcile('/bin/cursor-agent');
    expect(WriterMock).toHaveBeenCalledTimes(1);
  });

  it('flushes and drops the writer when capture is newly disabled', async () => {
    settingsMock.mockReturnValue({ captureAcpTraffic: true });
    const sink = new CursorAcpCaptureSink(makePlugin());
    sink.build('/bin/cursor-agent');
    const writer = lastWriter();

    settingsMock.mockReturnValue({ captureAcpTraffic: false });
    await sink.reconcile('/bin/cursor-agent');
    expect(writer.flush).toHaveBeenCalledTimes(1);

    // Dropped: later events no longer reach the (now-detached) writer.
    sink.event('after', {});
    expect(writer.event).not.toHaveBeenCalled();
  });

  it('is a no-op when the writer already matches the setting', async () => {
    settingsMock.mockReturnValue({ captureAcpTraffic: true });
    const sink = new CursorAcpCaptureSink(makePlugin());
    sink.build('/bin/cursor-agent');
    await sink.reconcile('/bin/cursor-agent'); // still on, writer present
    expect(WriterMock).toHaveBeenCalledTimes(1); // not rebuilt
  });
});

describe('CursorAcpCaptureSink.flush', () => {
  it('flushes and drops an active writer', async () => {
    settingsMock.mockReturnValue({ captureAcpTraffic: true });
    const sink = new CursorAcpCaptureSink(makePlugin());
    sink.build('/bin/cursor-agent');
    const writer = lastWriter();
    await sink.flush();
    expect(writer.flush).toHaveBeenCalledTimes(1);
    sink.event('after', {});
    expect(writer.event).not.toHaveBeenCalled();
  });

  it('is a safe no-op when there is no active writer', async () => {
    const sink = new CursorAcpCaptureSink(makePlugin());
    await expect(sink.flush()).resolves.toBeUndefined();
  });
});
