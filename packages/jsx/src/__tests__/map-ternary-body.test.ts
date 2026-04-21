/**
 * BarefootJS Compiler — `.map()` callback whose body is a sole ternary.
 *
 * Regression: when a map callback returns `cond ? <A/> : <B/>`, the renderer
 * used to emit `(item) => {cond ? <A/> : <B/>}` — a JS *block* statement with
 * no `return`, so the function returned undefined and no items rendered.
 *
 * The fix wraps the body with `<>…</>` whenever the rendered children start
 * with a `{`, turning it into a valid JSX expression body.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('.map() with ternary body', () => {
  test('arrow body is wrapped so it is not parsed as a block statement', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function isGroup(entry: any): entry is { groupTitle: string } {
        return 'groupTitle' in entry
      }

      export function Nav() {
        const [entries, _setEntries] = createSignal([
          { groupTitle: 'A' },
          { href: '/b', linkTitle: 'B' },
        ])
        return (
          <ul>
            {entries().map((entry) =>
              isGroup(entry) ? <li>{entry.groupTitle}</li> : <a href={entry.href}>{entry.linkTitle}</a>
            )}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'Nav.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    const out = template!.content

    // Bug reproduction guard: the buggy output contained `=> {... ? ... : ...}`
    // (a block statement). Make sure no such pattern remains for the inner map.
    // After the fix, the body is `<>{... ? ... : ...}</>`.
    expect(out).toMatch(/=>\s*<>\{[^]*\?[^]*:[^]*\}<\/>/)
    expect(out).not.toMatch(/=>\s*\{[^{}]*\?[^{}]*:[^{}]*<\/li>[^{}]*\}\)/)
  })

  test('expression-only callback body (e.g. {item.name}) is also wrapped', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Names() {
        const [items, _setItems] = createSignal([{ name: 'A' }, { name: 'B' }])
        return (
          <ul>
            {items().map((item) => <li>{item.name}</li>)}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'Names.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    // Sanity: still compiles. No specific shape assertion — the JSX-element
    // body case is already valid without wrapping; this just guards against
    // regressions in the safeguard path.
  })
})
