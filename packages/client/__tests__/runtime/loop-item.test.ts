/**
 * `sameLoopItem` — when a keyed loop row's item counts as changed. Every
 * keyed reconciler (`mapArray`, `mapArrayAnchored`, `mapArrayLazy`) asks it,
 * so rebuilt data (parsed again, mapped, deserialized) reconciles like data
 * that kept its references.
 */
import { describe, expect, test } from 'bun:test'
import { sameLoopItem } from '../../src/runtime/loop-item'

describe('sameLoopItem', () => {
  test('is Object.is for primitives and the same reference', () => {
    const o = { a: 1 }
    expect(sameLoopItem(o, o)).toBe(true)
    expect(sameLoopItem('a', 'a')).toBe(true)
    expect(sameLoopItem(NaN, NaN)).toBe(true)
    expect(sameLoopItem(0, -0)).toBe(false)
    expect(sameLoopItem('a', 'b')).toBe(false)
    expect(sameLoopItem(null, undefined)).toBe(false)
  })

  test('compares arrays one level down', () => {
    expect(sameLoopItem(['a', 1], ['a', 1])).toBe(true)
    expect(sameLoopItem(['a', 1], ['a', 2])).toBe(false)
    expect(sameLoopItem(['a'], ['a', 'b'])).toBe(false)
    expect(sameLoopItem([], [])).toBe(true)
  })

  test('compares plain objects one level down, keys and values', () => {
    expect(sameLoopItem({ id: '1', n: 2 }, { n: 2, id: '1' })).toBe(true)
    expect(sameLoopItem({ id: '1', n: 2 }, { id: '1', n: 3 })).toBe(false)
    expect(sameLoopItem({ id: '1' }, { id: '1', n: undefined })).toBe(false)
    expect(sameLoopItem({ id: '1', n: undefined }, { id: '1', m: undefined })).toBe(false)
    const bare = Object.assign(Object.create(null), { id: '1' })
    expect(sameLoopItem(bare, { id: '1' })).toBe(true)
  })

  test('compares nested values by reference', () => {
    const tags = ['x']
    expect(sameLoopItem({ tags }, { tags })).toBe(true)
    expect(sameLoopItem({ tags }, { tags: ['x'] })).toBe(false)
    expect(sameLoopItem([tags], [['x']])).toBe(false)
  })

  test('does not look inside class instances, dates, maps or functions', () => {
    class Point {
      constructor(public x: number) {}
    }
    expect(sameLoopItem(new Point(1), new Point(1))).toBe(false)
    expect(sameLoopItem(new Date(0), new Date(0))).toBe(false)
    expect(sameLoopItem(new Map(), new Map())).toBe(false)
    expect(sameLoopItem(() => 1, () => 1)).toBe(false)
  })

  test('never equates an array with a plain object', () => {
    expect(sameLoopItem(['a'], { 0: 'a' })).toBe(false)
    expect(sameLoopItem({ 0: 'a', length: 1 }, ['a'])).toBe(false)
  })
})
