/**
 * Each `'use client'` component compiles to:
 *   - `init${Name}` (declarative init function)
 *   - `hydrate('${Name}', { init, template })`
 *   - **`export function ${Name}(props, key) { return createComponent(...) }`**
 *
 * The shim lets consumers pass a JSX-defined client component as a
 * value — `<Flow renderNode={Bridge}>` and similar higher-order
 * patterns — without the bare `Bridge` reference becoming a free
 * variable. When the holding closure (e.g. Flow's reactive children
 * getter) later calls `Bridge(node)`, the shim returns a real DOM
 * element with the right scope so context, props, and the registered
 * template all line up.
 */
import { describe, expect, test } from 'bun:test'
import { TestAdapter } from '../adapters/test-adapter'
import { compileJSXSync } from '../compiler'

const adapter = new TestAdapter()

function clientJsFor(source: string, fileName: string): string {
  const result = compileJSXSync(source, fileName, { adapter })
  expect(result.errors).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe("'use client' component callable shim", () => {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function Bridge(props: { label: string }) {
      const [open, setOpen] = createSignal(false)
      return (
        <button type="button" onClick={() => setOpen(!open())}>
          {open() ? 'closed' : props.label}
        </button>
      )
    }
  `

  test('emits an exported callable function with the component name', () => {
    const js = clientJsFor(source, 'Bridge.tsx')
    expect(js).toContain('export function Bridge(')
    // The shim body delegates to createComponent against the registry.
    expect(js).toMatch(/export function Bridge\([^)]*\)\s*\{\s*return createComponent\(['"]Bridge['"]/)
  })

  test('shim sits after the hydrate registration, not inside init', () => {
    const js = clientJsFor(source, 'Bridge.tsx')
    const hydrateIdx = js.indexOf("hydrate('Bridge'")
    const shimIdx = js.indexOf('export function Bridge(')
    expect(hydrateIdx).toBeGreaterThan(0)
    expect(shimIdx).toBeGreaterThan(hydrateIdx)
  })

  test('imports createComponent from the runtime', () => {
    const js = clientJsFor(source, 'Bridge.tsx')
    expect(js).toMatch(/import\s*\{[^}]*\bcreateComponent\b[^}]*\}\s*from\s*['"]@barefootjs\/client\/runtime['"]/)
  })
})
