import { describe, expect, test } from 'bun:test'
import { parseExpression, type LoopParamBinding } from '@barefootjs/jsx'
import { goItemAccessor, loopKeyToGoRowExpr, rowItemPath, rowReadGoAccessor } from '../adapter/lib/loop-row-path'

// The Go code of a lowered key, or null.
const keyGo = (...args: Parameters<typeof loopKeyToGoRowExpr>) => loopKeyToGoRowExpr(...args)?.go ?? null

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
    expect(keyGo('o.label', { param: 'o' })).toBe('item.Label')
    expect(keyGo('o', { param: 'o' })).toBeNull()
    expect(keyGo('o.id + 1', { param: 'o' })).toBeNull()
    expect(keyGo('key', { param: '{ id: key }', paramBindings: destructured })).toBe('item.ID')
    expect(keyGo(undefined, { param: 'o' })).toBeNull()
  })

  test('a scalar row is its own key, and has no fields', () => {
    expect(keyGo('i', { param: 'i' }, { scalar: true })).toBe('item')
    expect(keyGo('i.length', { param: 'i' }, { scalar: true })).toBeNull()
    expect(rowReadGoAccessor(parseExpression('i'), { param: 'i' }, { scalar: true })).toBe('item')
  })

  test('a field path the struct row lacks declines', () => {
    const shape = { hasFieldPath: (segments: readonly unknown[]) => segments.length === 1 }
    expect(keyGo('o.id', { param: 'o' }, shape)).toBe('item.ID')
    expect(keyGo('o.label.length', { param: 'o' }, shape)).toBeNull()
    // A struct row passed whole to a child prop is a row read; only the key declines it.
    expect(rowReadGoAccessor(parseExpression('o'), { param: 'o' }, shape)).toBe('item')
  })

  test('a key built from the row and the index lowers to Go code in the row loop', () => {
    const row = { param: 'r', index: 'i' }
    const shape = { readGoType: (segments: readonly unknown[]) => (segments.length === 1 ? 'string' : null) }
    expect(keyGo('i', row)).toBe('i')
    expect(keyGo('String(r.id)', row, shape)).toBe('item.ID')
    expect(keyGo('r.id.toString()', row, shape)).toBe('item.ID')
    expect(keyGo('`${r.id}-${i}`', row, shape)).toBe('item.ID + "-" + bf.String(i)')
    expect(keyGo("r.id + '-' + i", row, shape)).toBe('bf.ConcatStr(bf.ConcatStr(item.ID, "-"), i)')
    expect(keyGo('n + i', { param: 'n', index: 'i' }, { scalar: true, readGoType: () => 'float64' })).toBe('bf.Add(item, i)')
  })

  test('a key reading outer state, or adding operands of unknown type, declines', () => {
    const row = { param: 'r', index: 'i' }
    expect(keyGo('props.prefix + r.id', row)).toBeNull()
    expect(keyGo('r.a + r.b', row)).toBeNull()
    expect(keyGo('r.a - i', row)).toBeNull()
    expect(keyGo('i', { param: 'r' })).toBeNull()
  })

  test('a key reports whether it reads the row, whatever its literal text says', () => {
    const row = { param: 'n', index: 'i' }
    expect(loopKeyToGoRowExpr('`item-${i}`', row)).toEqual({ go: '"item-" + bf.String(i)', readsRow: false })
    expect(loopKeyToGoRowExpr("'item' + i", row)).toEqual({ go: 'bf.ConcatStr("item", i)', readsRow: false })
    expect(loopKeyToGoRowExpr('`${n}-${i}`', row, { scalar: true })?.readsRow).toBe(true)
    expect(loopKeyToGoRowExpr('String(n)', row, { scalar: true })?.readsRow).toBe(true)
  })
})
