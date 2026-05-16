/**
 * Regression for #1297: `outputIR: true` must emit an IR file for every
 * component in a multi-component source — `compileMultipleComponents`
 * previously skipped IR emission entirely, so any source with two or
 * more components (including `'use client'` files with a helper) silently
 * returned `markedTemplate` + `clientJs` + `types` but no `ir` file even
 * when the caller explicitly opted in.
 *
 * The contract this pins: "if the user asks for IR, they get IR" — one
 * `*.ir.json` `FileOutput` per component, regardless of `isClient` or
 * the selected adapter.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('outputIR contract (#1297)', () => {
  test("multi-component 'use client' source emits one IR file per component", () => {
    const source = `
'use client'
import { createContext, useContext } from '@barefootjs/client'

const ThemeContext = createContext('light')

function ThemeLabel() {
  const theme = useContext(ThemeContext)
  return <span>{theme}</span>
}

export function ThemeRoot() {
  return (
    <ThemeContext.Provider value="dark">
      <ThemeLabel />
    </ThemeContext.Provider>
  )
}
`
    const result = compileJSX(source, 'theme.tsx', { adapter, outputIR: true })
    const errors = result.errors.filter(e => e.severity === 'error')
    expect(errors).toEqual([])

    const irFiles = result.files.filter(f => f.type === 'ir')
    const names = irFiles
      .map(f => (JSON.parse(f.content) as { metadata: { componentName: string } }).metadata.componentName)
      .sort()
    expect(names).toEqual(['ThemeLabel', 'ThemeRoot'])
    // Paths must be unique so callers can address each IR individually.
    const paths = irFiles.map(f => f.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  test('single-component source emits exactly one IR file at the canonical path', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
}
`
    const result = compileJSX(source, 'counter.tsx', { adapter, outputIR: true })
    const errors = result.errors.filter(e => e.severity === 'error')
    expect(errors).toEqual([])

    const irFiles = result.files.filter(f => f.type === 'ir')
    expect(irFiles).toHaveLength(1)
    expect(irFiles[0].path).toBe('counter.ir.json')
  })

  test("multi-component non-'use client' source still emits one IR per component", () => {
    const source = `
function Inner() {
  return <span>inner</span>
}

export function Outer() {
  return <div><Inner /></div>
}
`
    const result = compileJSX(source, 'static.tsx', { adapter, outputIR: true })
    const errors = result.errors.filter(e => e.severity === 'error')
    expect(errors).toEqual([])

    const irFiles = result.files.filter(f => f.type === 'ir')
    const names = irFiles
      .map(f => (JSON.parse(f.content) as { metadata: { componentName: string } }).metadata.componentName)
      .sort()
    expect(names).toEqual(['Inner', 'Outer'])
  })
})
