import { describe, expect, test } from 'bun:test'
import { materializeGetterCalls, parseExpression, stringifyParsedExpr } from '../expression-parser'

/**
 * `materializeGetterCalls` rewrites a zero-arg getter call (`tag()`) into the
 * bare identifier (`tag`) wherever the callee name is in the caller-supplied
 * set — the SSR seed/constructor-context reduction described on the function
 * (a getter call reads the already-seeded value, so `tag()` IS `tag` there).
 * These tests pin: the rewrite itself, the two guards that must NOT rewrite
 * (a call with args; a name outside the set), and that it recurses into a
 * realistic `.filter` predicate without touching the unrelated `.includes`
 * receiver path. (#2076 follow-up — Package A)
 */

describe('materializeGetterCalls', () => {
  test('rewrites a zero-arg call whose callee is in `names` to a bare identifier', () => {
    const rewritten = materializeGetterCalls(parseExpression('tag()'), new Set(['tag']))
    expect(rewritten).toEqual({ kind: 'identifier', name: 'tag' })
  })

  test('leaves a call WITH args untouched, even when the callee is in `names`', () => {
    const rewritten = materializeGetterCalls(parseExpression('tag(1)'), new Set(['tag']))
    expect(stringifyParsedExpr(rewritten)).toBe('tag(1)')
  })

  test('leaves a call untouched when the callee name is not in `names`', () => {
    const rewritten = materializeGetterCalls(parseExpression('tag()'), new Set(['other']))
    expect(stringifyParsedExpr(rewritten)).toBe('tag()')
  })

  test('recurses into a filter predicate: both `tag()` occurrences rewrite, `p.tags.includes(...)` receiver is untouched', () => {
    const body = parseExpression('!tag() || p.tags.includes(tag())')
    const rewritten = materializeGetterCalls(body, new Set(['tag']))
    expect(rewritten).toEqual({
      kind: 'logical',
      op: '||',
      left: { kind: 'unary', op: '!', argument: { kind: 'identifier', name: 'tag' } },
      right: {
        kind: 'array-method',
        method: 'includes',
        object: {
          kind: 'member',
          object: { kind: 'identifier', name: 'p' },
          property: 'tags',
          computed: false,
        },
        args: [{ kind: 'identifier', name: 'tag' }],
      },
    })
  })

  test('does not mutate the input tree', () => {
    const original = parseExpression('tag()')
    const snapshot = JSON.stringify(original)
    materializeGetterCalls(original, new Set(['tag']))
    expect(JSON.stringify(original)).toBe(snapshot)
  })
})
