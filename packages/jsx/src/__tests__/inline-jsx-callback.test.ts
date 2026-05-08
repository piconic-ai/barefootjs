/**
 * Inline JSX-in-arrow-callback compilation (#1211).
 *
 * Without preprocessing, `renderNode={(n) => <div>{n.data.label}</div>}`
 * leaks raw JSX into the client bundle and breaks `Function`/parser
 * loading with `SyntaxError: Unexpected token '<'`. The fix hoists
 * the inline arrow into a synthesized PascalCase component that the
 * regular pipeline compiles into init + hydrate + a callable shim.
 */

import { describe, expect, test } from 'bun:test'
import { TestAdapter } from '../adapters/test-adapter'
import { compileJSX } from '../compiler'

const adapter = new TestAdapter()

function clientJs(source: string, fileName = 'Demo.tsx'): string {
  const result = compileJSX(source, fileName, { adapter })
  expect(result.errors).toEqual([])
  const file = result.files.find(f => f.type === 'clientJs')
  expect(file).toBeDefined()
  return file!.content
}

describe('inline JSX in arrow callback (#1211)', () => {
  test('rewrites renderNode={(n) => <jsx/>} into a synthesized component reference', () => {
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => <div>{n.data.label}</div>}
          />
        )
      }
    `
    const js = clientJs(source)
    // The arrow body's JSX must NOT survive as live JS (which would
    // crash the parser). Template literals inside synthesized
    // `template:` strings are fine — those are just strings.
    expect(js).not.toMatch(/=>\s*<div\b/)
    expect(js).not.toMatch(/=>\s*\(\s*<div\b/)
    expect(js).not.toMatch(/return\s*<div\b/)

    // The synthesized component is registered and exported as a callable shim.
    expect(js).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback1(?:__|['"])/)
    expect(js).toMatch(/export function BFInlineJsxCallback1\b/)

    // The Demo's renderNode prop value references the synthesized name.
    expect(js).toContain('BFInlineJsxCallback1')
  })

  test('emits the synthesized component init alongside the host component', () => {
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => <span class="badge">{n.data.label}</span>}
          />
        )
      }
    `
    const js = clientJs(source)
    expect(js).toMatch(/function init(?:BFInlineJsxCallback1|_BFInlineJsxCallback1)\b/)
  })

  test('multiple inline arrows in the same source get distinct names', () => {
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        return (
          <div>
            <Flow nodes={[]} edges={[]} renderNode={(a) => <span>{a.id}</span>} />
            <Flow nodes={[]} edges={[]} renderNode={(b) => <em>{b.id}</em>} />
          </div>
        )
      }
    `
    const js = clientJs(source)
    expect(js).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback1(?:__|['"])/)
    expect(js).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback2(?:__|['"])/)
  })

  test('block-body arrow with JSX return is rewritten the same way', () => {
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => {
              return <article>{n.data.label}</article>
            }}
          />
        )
      }
    `
    const js = clientJs(source)
    expect(js).not.toMatch(/=>\s*\{[\s\S]*<article>/)
    expect(js).toMatch(/hydrate\(\s*['"]BFInlineJsxCallback1(?:__|['"])/)
  })

  test('arrows whose body is not JSX are left alone', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return (
          <button onClick={() => setCount(count() + 1)}>{count()}</button>
        )
      }
    `
    const js = clientJs(source)
    // No synthesized component should be emitted for plain event handlers.
    expect(js).not.toContain('BFInlineJsxCallback')
  })

  test('reports BF080 when the inline arrow captures a non-module identifier', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        const [tone, setTone] = createSignal('blue')
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => <div class={tone()}>{n.data.label}</div>}
          />
        )
      }
    `
    const result = compileJSX(source, 'Demo.tsx', { adapter })
    expect(result.errors.some(e => e.code === 'BF080')).toBe(true)
    const bf080 = result.errors.find(e => e.code === 'BF080')!
    expect(bf080.message).toContain('tone')
  })

  test('module-scope identifiers do not trigger BF080', () => {
    const source = `
      'use client'
      import { Flow } from '@/components/ui/xyflow'

      const PREFIX = 'badge-'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => <span>{PREFIX + n.id}</span>}
          />
        )
      }
    `
    const result = compileJSX(source, 'Demo.tsx', { adapter })
    expect(result.errors.filter(e => e.code === 'BF080')).toEqual([])
  })

  test('non-use-client files are left untouched', () => {
    const source = `
      import { Flow } from '@/components/ui/xyflow'

      export function Demo() {
        return (
          <Flow
            nodes={[]}
            edges={[]}
            renderNode={(n) => <div>{n.data.label}</div>}
          />
        )
      }
    `
    const result = compileJSX(source, 'Demo.tsx', { adapter })
    // No BF080 — but no synthesis either; the file just doesn't ship a
    // client bundle and its arrow stays inert in the SSR template.
    expect(result.errors.filter(e => e.code === 'BF080')).toEqual([])
  })
})
