import { ok, err, type Result } from './Result'

// `String(thrown)` invokes the value's `Symbol.toPrimitive` / `toString` /
// `valueOf` — any of which can throw (e.g. on `Object.create(null)`, or
// objects with throwing coercion hooks). The helper guarantees callers
// receive a Result, so coercion must never escape.
function safeStringify(value: unknown): string {
  try {
    return String(value)
  } catch {
    return '[unstringifiable thrown value]'
  }
}

function toError(thrown: unknown, context?: string): Error {
  if (thrown instanceof Error) {
    if (!context) return thrown
    const wrapped = new Error(`${context}: ${thrown.message}`)
    wrapped.cause = thrown
    return wrapped
  }
  const message = safeStringify(thrown)
  return new Error(context ? `${context}: ${message}` : message)
}

/**
 * Run an async function and return its outcome as a Result.
 * Domain and application code use this instead of raw try/catch.
 */
export async function tryAsync<T>(
  fn: () => Promise<T>,
  context?: string,
): Promise<Result<T>> {
  try {
    return ok(await fn())
  } catch (thrown) {
    return err(toError(thrown, context))
  }
}

/**
 * Run a synchronous function and return its outcome as a Result.
 */
export function trySync<T>(fn: () => T, context?: string): Result<T> {
  try {
    return ok(fn())
  } catch (thrown) {
    return err(toError(thrown, context))
  }
}
