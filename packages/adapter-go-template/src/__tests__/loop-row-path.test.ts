import { describe, expect, test } from 'bun:test'
import { parseExpression, type LoopParamBinding } from '@barefootjs/jsx'
import { goItemAccessor, loopKeyToGoRowExpr, rowItemPath, rowReadGoAccessor } from '../adapter/lib/loop-row-path'

const field = (key: string) => ({ kind: 'field' as const, key, isIdent: true })

// `({ id: key, meta: { tone }, ...rest }) => …`
const destructured: LoopParamBinding[] = [
  { name: 'key', path: '.id', segments: [field('id')] },
  { name: 'tone', path: '.meta.tone', segments: [field('meta'), field('tone')] },
  { name: 'rest', path: '', segments: [], rest: { kind: 'object', exclude: [] } },
]

describe('loop-row path resolution (#3313)', () => {
  test('a plain param resolves its own reads', () => {
    const row = { param: 'o' }
    expect(rowItemPath(parseExpression('o'), row)).toEqual([])
    expect(goItemAccessor(rowItemPath(parseExpression('o.meta.tone'), row)!)).toBe('item.Meta.Tone')
    expect(rowItemPath(parseExpression('other.tone'), row)).toBeNull()
  })

  test('a destructured binding resolves through its segments', () => {
    const row = { param: '{ id: key, meta: { tone }, ...rest }', paramBindings: destructured }
    expect(goItemAccessor(rowItemPath(parseExpression('key'), row)!)).toBe('item.ID')
    expect(goItemAccessor(rowItemPath(parseExpression('tone'), row)!)).toBe('item.Meta.Tone')
    expect(rowItemPath(parseExpression('rest'), row)).toBeNull()
    expect(rowItemPath(parseExpression('id'), row)).toBeNull()
  })

  test('an index or non-identifier segment has no Go field path', () => {
    expect(goItemAccessor([{ kind: 'index', index: 0 }])).toBeNull()
    expect(goItemAccessor([{ kind: 'field', key: 'data-x', isIdent: false }])).toBeNull()
  })

  test('loop keys lower to the source row field, never a struct row as a whole', () => {
    expect(loopKeyToGoRowExpr('o.label', { param: 'o' })).toBe('item.Label')
    expect(loopKeyToGoRowExpr('o', { param: 'o' })).toBeNull()
    expect(loopKeyToGoRowExpr('o.id + 1', { param: 'o' })).toBeNull()
    expect(loopKeyToGoRowExpr('key', { param: '{ id: key }', paramBindings: destructured })).toBe('item.ID')
    expect(loopKeyToGoRowExpr(undefined, { param: 'o' })).toBeNull()
  })

  test('a scalar row is its own key, and has no fields', () => {
    expect(loopKeyToGoRowExpr('i', { param: 'i' }, { scalar: true })).toBe('item')
    expect(loopKeyToGoRowExpr('i.length', { param: 'i' }, { scalar: true })).toBeNull()
    expect(rowReadGoAccessor(parseExpression('i'), { param: 'i' }, { scalar: true })).toBe('item')
  })

  test('a field path the struct row lacks declines', () => {
    const shape = { hasFieldPath: (segments: readonly unknown[]) => segments.length === 1 }
    expect(loopKeyToGoRowExpr('o.id', { param: 'o' }, shape)).toBe('item.ID')
    expect(loopKeyToGoRowExpr('o.label.length', { param: 'o' }, shape)).toBeNull()
    // A struct row passed whole to a child prop is a row read; only the key declines it.
    expect(rowReadGoAccessor(parseExpression('o'), { param: 'o' }, shape)).toBe('item')
  })
})
