import { JsonRpcErrorResponse, JsonRpcTransportClosedError } from '@/providers/acp';
import {
  formatCursorRuntimeError,
  isCursorAuthenticationFailure,
  isCursorSessionLoadTransportFailure,
  readStructuredErrorCode,
} from '@/providers/cursor/runtime/cursorRuntimeErrors';

describe('readStructuredErrorCode', () => {
  it('reads and uppercases the first present of code/reason/type', () => {
    expect(readStructuredErrorCode({ code: 'unauthorized' })).toBe('UNAUTHORIZED');
    expect(readStructuredErrorCode({ reason: 'auth_required' })).toBe('AUTH_REQUIRED');
    expect(readStructuredErrorCode({ type: 'Timeout' })).toBe('TIMEOUT');
    // code wins over reason/type
    expect(readStructuredErrorCode({ code: 'a', reason: 'b', type: 'c' })).toBe('A');
  });

  it('returns null for non-objects, arrays, and blank values', () => {
    expect(readStructuredErrorCode(null)).toBeNull();
    expect(readStructuredErrorCode('code')).toBeNull();
    expect(readStructuredErrorCode(['code'])).toBeNull();
    expect(readStructuredErrorCode({ code: '   ' })).toBeNull();
    expect(readStructuredErrorCode({ other: 'x' })).toBeNull();
  });
});

describe('isCursorAuthenticationFailure', () => {
  it('matches an AUTH-family structured code on a JsonRpcErrorResponse', () => {
    expect(
      isCursorAuthenticationFailure(new JsonRpcErrorResponse('session/new', -32000, 'nope', { code: 'UNAUTHENTICATED' })),
    ).toBe(true);
    expect(
      isCursorAuthenticationFailure(new JsonRpcErrorResponse('session/new', -32000, 'nope', { code: 'AUTH_REQUIRED' })),
    ).toBe(true);
  });

  it('matches known auth phrases in a plain error message', () => {
    expect(isCursorAuthenticationFailure(new Error('Login required to continue'))).toBe(true);
    expect(isCursorAuthenticationFailure('not authenticated')).toBe(true);
  });

  it('does not match unrelated failures', () => {
    expect(isCursorAuthenticationFailure(new Error('disk full'))).toBe(false);
    expect(
      isCursorAuthenticationFailure(new JsonRpcErrorResponse('x', -32000, 'boom', { code: 'INTERNAL' })),
    ).toBe(false);
    // Near-miss: "authoritative" must not word-match "authentication"/"unauthorized".
    expect(isCursorAuthenticationFailure(new Error('authoritative model metadata unavailable'))).toBe(false);
  });
});

describe('isCursorSessionLoadTransportFailure', () => {
  it('matches a transport-closed error instance', () => {
    expect(isCursorSessionLoadTransportFailure(new JsonRpcTransportClosedError())).toBe(true);
  });

  it('matches errno transport codes case-insensitively', () => {
    expect(isCursorSessionLoadTransportFailure({ code: 'ECONNRESET' })).toBe(true);
    expect(isCursorSessionLoadTransportFailure({ code: 'epipe' })).toBe(true);
    expect(isCursorSessionLoadTransportFailure({ code: 'ETIMEDOUT' })).toBe(true);
  });

  it('matches transport/timeout phrasing in the message', () => {
    expect(isCursorSessionLoadTransportFailure(new Error('ACP transport disconnected mid-load'))).toBe(true);
    expect(isCursorSessionLoadTransportFailure(new Error('request timed out'))).toBe(true);
  });

  it('does not match an ordinary error', () => {
    expect(isCursorSessionLoadTransportFailure(new Error('bad request'))).toBe(false);
    expect(isCursorSessionLoadTransportFailure({ code: 'ENOENT' })).toBe(false);
    // Near-miss: arbitrary "closed" text must not read as a transport drop.
    expect(isCursorSessionLoadTransportFailure(new Error('closed beta session not found'))).toBe(false);
  });
});

describe('formatCursorRuntimeError', () => {
  it('uses the error message and appends stderr when present', () => {
    expect(formatCursorRuntimeError(new Error('boom'))).toBe('boom');
    expect(formatCursorRuntimeError(new Error('boom'), 'stack trace')).toBe('boom\n\nstack trace');
  });

  it('falls back to a generic message for non-Errors and ignores empty stderr', () => {
    expect(formatCursorRuntimeError('weird')).toBe('Cursor ACP request failed');
    expect(formatCursorRuntimeError(new Error('boom'), '')).toBe('boom');
    expect(formatCursorRuntimeError(new Error('boom'), null)).toBe('boom');
  });
});
