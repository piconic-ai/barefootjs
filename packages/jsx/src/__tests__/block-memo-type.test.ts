/**
 * #3523: a block-bodied memo with no type argument is typed from the
 * analyzer's fold of its statements, not from the block's text, where `{`
 * reads as an object (Go Template then declared a `map[string]interface{}`
 * field and rendered `map[]`). A block that doesn't fold keeps the text
 * heuristic.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'

function memoType(callback: string, typeArg = '') {
  const source = `
    'use client'
    import { createSignal, createMemo } from '@barefootjs/client'
    export function C({ label }: { label?: string }) {
      const [count] = createSignal(2)
      const m = createMemo${typeArg}(${callback})
      return <p>{String(m())}</p>
    }
  `
  const memo = analyzeComponent(source, 'C.tsx').memos.find((x) => x.name === 'm')
  if (!memo) throw new Error('memo not collected')
  return memo.type.kind
}

describe('block memo type from its fold (#3523)', () => {
  test.each([
    "() => { if (count() > 5) return 'big'\n return 'small' }",
    "() => { if (!label) return 'none'\n return label }",
    '() => { const k = count()\n return k * 3 }',
  ])('%s is not typed as an object', (callback) => {
    expect(memoType(callback)).not.toBe('object')
  })

  test('a block returning an object literal is still an object', () => {
    expect(memoType('() => { const k = count()\n return { k } }')).toBe('object')
  })

  test('a block that does not fold keeps the text heuristic', () => {
    expect(memoType('() => { let n = 0\n for (const x of [1, 2]) n += x\n return n }')).toBe('object')
  })

  test('an explicit type argument wins', () => {
    expect(memoType('() => { const k = count()\n return k * 3 }', '<number>')).toBe('primitive')
  })
})
