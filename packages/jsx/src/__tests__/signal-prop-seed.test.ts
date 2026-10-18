import { describe, expect, test } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

/**
 * The CSR init body (`resolveSignalInitialValue`), the CSR template
 * (`normalizeSignalInitial`) and the controlled-signal sync
 * (`getControlledPropName`) read one fact, the analyzer's
 * `SignalInfo.propSeed`, so they agree on every initializer shape (#3508).
 */
function clientJs(init: string, params = 'props: { a?: string; b?: string; n?: number; row?: { count: number } }'): string {
  const source = `'use client'
import { createSignal } from '@barefootjs/client'
export function T(${params}) {
  const [v, setV] = createSignal(${init})
  return <button onClick={() => setV(v())}>{String(v())}</button>
}
`
  const result = compileJSX(source, 'T.tsx', { adapter: new TestAdapter() })
  const file = result.files.find(f => f.path.endsWith('.client.js'))
  if (!file) throw new Error('no client JS')
  return file.content
}

const declaration = (js: string) => js.match(/createSignal\((.*)\)\n/)?.[1]
const parses = (js: string) => {
  new Function(js.replace(/^import .*$/gm, '').replace(/^export /gm, ''))
  return true
}

describe('signal prop seed', () => {
  test('a `||` / `&&` initializer is kept as written in the init body and the template', () => {
    for (const init of ["props.a || 'x'", "props.a && 'x'"]) {
      const js = clientJs(init)
      const expected = init.replace('props.', '_p.')
      expect(declaration(js)).toBe(expected)
      expect(js).toContain(`(${expected})`)
      expect(parses(js)).toBe(true)
    }
  })

  test('a bare props read gets the same type default in both places', () => {
    const js = clientJs('props.n')
    const seed = declaration(js)
    expect(seed).toMatch(/^_p\.n \?\? \S+$/)
    expect(js).toContain(`(${seed})`)
  })

  test('a nested props read gets the type default but is not controlled', () => {
    const js = clientJs('props.row.count')
    expect(declaration(js)).toMatch(/^_p\.row\.count \?\? \S+$/)
    expect(js).not.toContain('if (__val !== undefined)')
  })

  test('a controlled `||` seed re-syncs to the initializer, not the raw prop', () => {
    const js = clientJs("props.a || 'x'")
    expect(js).toContain('const __val = _p.a')
    expect(js).toContain("if (__val !== undefined) setV(_p.a || 'x')")
  })

  test('a controlled `??` seed re-syncs to the prop', () => {
    const js = clientJs("props.a ?? 'x'")
    expect(js).toContain('if (__val !== undefined) setV(__val)')
  })

  test('an expression that only starts with a props read gets no appended default', () => {
    for (const init of ['props.n + 1', "props.a ? 'y' : 'n'"]) {
      expect(declaration(clientJs(init))).toBe(init.replaceAll('props.', '_p.'))
    }
  })

  test('a chained `??` seed stays controlled by its leftmost prop', () => {
    const js = clientJs("props.a ?? props.b ?? 'x'")
    expect(declaration(js)).toBe("_p.a ?? _p.b ?? 'x'")
    expect(js).toContain('const __val = _p.a')
    expect(js).toContain('if (__val !== undefined) setV(__val)')
  })

  test('a chained `||` seed stays controlled and re-syncs to the initializer', () => {
    const js = clientJs("props.a || props.b || 'x'")
    expect(js).toContain('const __val = _p.a')
    expect(js).toContain("if (__val !== undefined) setV(_p.a || _p.b || 'x')")
  })

  test('a chained seed over destructured props stays controlled', () => {
    const js = clientJs("a ?? b ?? 'x'", '{ a, b }: { a?: string; b?: string }')
    expect(js).toContain('const __val = _p.a')
    expect(js).toContain('if (__val !== undefined) setV(__val)')
  })
})
