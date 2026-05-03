import { describe, expect, it } from 'vitest'
import { tryAsync, trySync } from '@/domain/shared/tryAsync'

describe('trySync', () => {
  it('wraps a value in ok', () => {
    const result = trySync(() => 42)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(42)
  })

  it('wraps a thrown Error in err', () => {
    const boom = new Error('boom')
    const result = trySync(() => {
      throw boom
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(boom)
  })

  it('coerces a non-Error throw into an Error', () => {
    const result = trySync(() => {
      throw 'plain string'
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error)
      expect(result.error.message).toBe('plain string')
    }
  })

  it('prefixes the error message with context and preserves cause', () => {
    const original = new Error('original')
    const result = trySync(() => {
      throw original
    }, 'while parsing')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe('while parsing: original')
      expect(result.error.cause).toBe(original)
    }
  })
})

describe('tryAsync', () => {
  it('wraps a resolved value in ok', async () => {
    const result = await tryAsync(async () => 'hi')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('hi')
  })

  it('wraps a rejection in err', async () => {
    const boom = new Error('async boom')
    const result = await tryAsync(async () => {
      throw boom
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(boom)
  })

  it('coerces a non-Error rejection', async () => {
    const result = await tryAsync(async () => {
      throw { code: 42 }
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(Error)
  })

  it('prefixes the rejection message with context', async () => {
    const result = await tryAsync(async () => {
      throw new Error('inner')
    }, 'while loading')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('while loading: inner')
  })

  it('returns err — never rejects — when the thrown value cannot be stringified', async () => {
    const unstringifiable = Object.create(null) as object
    const result = await tryAsync(async () => {
      throw unstringifiable
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(Error)
  })

  it('returns err — never rejects — when toString itself throws', async () => {
    const hostile = {
      toString() {
        throw new Error('toString-boom')
      },
    }
    const result = await tryAsync(async () => {
      throw hostile
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(Error)
  })
})

describe('trySync — coercion hardening', () => {
  it('returns err — never throws — when the thrown value cannot be stringified', () => {
    const unstringifiable = Object.create(null) as object
    const result = trySync(() => {
      throw unstringifiable
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(Error)
  })
})
