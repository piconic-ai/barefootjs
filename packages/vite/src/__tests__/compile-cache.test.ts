import { describe, test, expect } from 'bun:test'
import { CompileCache } from '../compile-cache.ts'
import type { CompileResult } from '@barefootjs/jsx'

function fakeResult(tag: string): CompileResult {
  return { files: [{ path: tag, content: tag, type: 'clientJs' }], errors: [] }
}

describe('CompileCache', () => {
  test('compiles once for the same (path, content) pair', () => {
    const cache = new CompileCache()
    let calls = 0
    const compile = () => {
      calls++
      return fakeResult('a')
    }

    const first = cache.getOrCompile('/a.tsx', 'content', compile)
    const second = cache.getOrCompile('/a.tsx', 'content', compile)

    expect(calls).toBe(1)
    expect(first).toBe(second)
  })

  test('recompiles when the content changes', () => {
    const cache = new CompileCache()
    let calls = 0
    const compile = () => {
      calls++
      return fakeResult(`v${calls}`)
    }

    const first = cache.getOrCompile('/a.tsx', 'v1', compile)
    const second = cache.getOrCompile('/a.tsx', 'v2', compile)

    expect(calls).toBe(2)
    expect(first).not.toBe(second)
  })

  test('tracks distinct paths independently', () => {
    const cache = new CompileCache()
    let calls = 0
    const compile = () => {
      calls++
      return fakeResult(`n${calls}`)
    }

    cache.getOrCompile('/a.tsx', 'same', compile)
    cache.getOrCompile('/b.tsx', 'same', compile)

    expect(calls).toBe(2)
  })

  test('peek returns undefined before any compile and the cached result after', () => {
    const cache = new CompileCache()
    expect(cache.peek('/a.tsx')).toBeUndefined()
    const result = cache.getOrCompile('/a.tsx', 'content', () => fakeResult('a'))
    expect(cache.peek('/a.tsx')).toBe(result)
  })

  test('clear() forces a recompile', () => {
    const cache = new CompileCache()
    let calls = 0
    const compile = () => {
      calls++
      return fakeResult('a')
    }
    cache.getOrCompile('/a.tsx', 'content', compile)
    cache.clear()
    cache.getOrCompile('/a.tsx', 'content', compile)
    expect(calls).toBe(2)
  })
})
