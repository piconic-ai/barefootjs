import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToTest } from '@barefootjs/test'

// IR-level test for the JSX-native Background (#1081 step 3). Verifies the
// SVG > defs > pattern > {circle | path} > rect tree shape and reactive
// memos that drive the pattern attributes.
const source = readFileSync(resolve(__dirname, '../components/background.tsx'), 'utf-8')

describe('Background JSX shape (#1081 step 3)', () => {
  const result = renderToTest(source, 'background.tsx', 'Background')

  test('JSX → IR pipeline reports no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('component is recognized as a client component', () => {
    expect(result.isClient).toBe(true)
  })

  test('declares pattern geometry memos', () => {
    expect(result.memos).toContain('patternBox')
    expect(result.memos).toContain('patternWidth')
    expect(result.memos).toContain('patternHeight')
    expect(result.memos).toContain('patternX')
    expect(result.memos).toContain('patternY')
  })

  test('declares variant-specific child memos', () => {
    expect(result.memos).toContain('dotR')
    expect(result.memos).toContain('dotCx')
    expect(result.memos).toContain('dotCy')
    expect(result.memos).toContain('linePathD')
    expect(result.memos).toContain('crossPathD')
  })

  test('renders an outer <svg> with absolute positioning style', () => {
    const svg = result.find({ tag: 'svg' })
    expect(svg).not.toBeNull()
    expect(svg!.props['style']).toContain('position: absolute')
    expect(svg!.props['style']).toContain('pointer-events: none')
  })

  test('declares <defs> > <pattern>', () => {
    const pattern = result.find({ tag: 'pattern' })
    expect(pattern).not.toBeNull()
    expect(pattern!.props['patternUnits']).toBe('userSpaceOnUse')
  })

  test('renders a fill rect at 100% x 100%', () => {
    const rect = result.find({ tag: 'rect' })
    expect(rect).not.toBeNull()
    expect(rect!.props['width']).toBe('100%')
    expect(rect!.props['height']).toBe('100%')
  })
})
