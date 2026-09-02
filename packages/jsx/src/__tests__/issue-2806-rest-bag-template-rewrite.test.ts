/**
 * #2806 — a component reading its own rest-bag spread directly in JSX
 * (`{rest.header}`, not spread onto an element's attrs) emitted a CSR
 * template that referenced the bare, unbound `rest` identifier.
 *
 * The rest binding IS `_p` at runtime (`applyRestAttrs` excludes the
 * consumed keys by name rather than constructing a narrower object, and
 * the init body already rewrites `rest.x` → `_p.x` via
 * `rewritePropsObjectRef`, #2723). The four CSR/static template builders
 * in `html-template.ts` each call that same function for `propsObjectName`
 * but were passing `null` for the rest name, so a direct rest-bag read
 * never got the same treatment there.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJs(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  return result.files.find(f => f.type === 'clientJs')!.content
}

describe('#2806 — rest-bag identifier resolves in the CSR template', () => {
  test('a direct rest-bag read in a text expression emits `_p.x`, not bare `rest`', () => {
    const content = clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function Card({ children, ...rest }: { children?: any; [key: string]: any }) {
        const [cond, setCond] = createSignal(true)
        return (
          <section>
            <header>{cond() ? rest.header : null}</header>
            <div>{children}</div>
          </section>
        )
      }
    `)
    expect(content).toContain('_p.header')
    expect(content).not.toMatch(/[^.\w]rest\.header/)
  })

  test('a rest-bag read inside a `.map()` row still resolves', () => {
    const content = clientJs(`
      "use client";
      export function Row({ children, ...rest }: { children?: any; items?: Array<{ id: number }>; [key: string]: any }) {
        return (
          <ul>
            {(rest.items ?? []).map((item: { id: number }) => (
              <li key={item.id}>{rest.suffix}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(content).toContain('_p.suffix')
    expect(content).not.toMatch(/[^.\w]rest\.suffix/)
  })

  test('a `.map()` row PARAMETER literally named `rest` is not rewritten (shadow guard)', () => {
    const content = clientJs(`
      "use client";
      export function List({ children, ...outer }: { children?: any; [key: string]: any }) {
        const rows = [{ id: 1, name: 'a' }]
        return (
          <ul>
            {rows.map(rest => (
              <li key={rest.id}>{rest.name}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(content).not.toContain('_p.name')
    expect(content).toContain('rest.name')
  })
})
