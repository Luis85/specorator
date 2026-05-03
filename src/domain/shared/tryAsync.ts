import { ok, err, type Result } from './Result'

function toError(thrown: unknown, context?: string): Error {
  const base = thrown instanceof Error ? thrown : new Error(String(thrown))
  if (!context) return base
  const wrapped = new Error(`${context}: ${base.message}`)
  if (thrown instanceof Error) wrapped.cause = thrown
  return wrapped
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
