import { describe, test, expect } from 'bun:test'
import { bfChildMarkerName, BF_CHILD_NOOP_ID } from '../child-marker.ts'

describe('bfChildMarkerName', () => {
  test('extracts the child name from a compiler-emitted marker', () => {
    expect(bfChildMarkerName('/* @bf-child:TodoItem */')).toBe('TodoItem')
  })

  test('returns null for a normal specifier', () => {
    expect(bfChildMarkerName('./TodoItem')).toBeNull()
    expect(bfChildMarkerName('@barefootjs/client')).toBeNull()
  })

  test('returns null for a marker-shaped string with extra characters', () => {
    expect(bfChildMarkerName('/* @bf-child:TodoItem */extra')).toBeNull()
    expect(bfChildMarkerName('prefix/* @bf-child:TodoItem */')).toBeNull()
  })
})

describe('BF_CHILD_NOOP_ID', () => {
  test('is a virtual (null-byte-prefixed) module id', () => {
    expect(BF_CHILD_NOOP_ID.startsWith('\0')).toBe(true)
  })
})
