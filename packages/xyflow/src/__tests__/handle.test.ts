import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToTest } from '@barefootjs/test'

// IR-level test for the JSX-native Handle (#1081 step 5). Verifies the
// data attributes that connection.ts and @xyflow/system query against,
// the position-derived inline style, and the className shape.
const source = readFileSync(resolve(__dirname, '../components/handle.tsx'), 'utf-8')

describe('Handle JSX shape (#1081 step 5)', () => {
  const result = renderToTest(source, 'handle.tsx', 'Handle')

  test('JSX → IR pipeline reports no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('component is recognized as a client component', () => {
    expect(result.isClient).toBe(true)
  })

  test('declares handleType, position, className, style memos', () => {
    expect(result.memos).toContain('handleType')
    expect(result.memos).toContain('position')
    expect(result.memos).toContain('className')
    expect(result.memos).toContain('style')
  })

  test('renders a single positioned <div>', () => {
    const divs = result.findAll({ tag: 'div' })
    expect(divs.length).toBe(1)
  })

  test('div carries data-* attributes that @xyflow/system queries', () => {
    const div = result.find({ tag: 'div' })!
    // The compiler records the binding source as the prop key after
    // camelCase normalization. Reading the keys is enough to confirm
    // the IR exposes each attribute (the values are reactive memos).
    const keys = Object.keys(div.props)
    expect(keys).toContain('data-handle-type')
    expect(keys).toContain('data-handlepos')
    expect(keys).toContain('data-handle-position')
    expect(keys).toContain('data-node-id')
    expect(keys).toContain('data-handleid')
  })
})
