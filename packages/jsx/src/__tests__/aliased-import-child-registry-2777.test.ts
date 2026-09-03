/**
 * #2777 — a client component referenced under an import alias
 * (`import { Foo as Bar } from './Foo'`, `<Bar/>`) compiled with no
 * diagnostics, but the parent's client JS emitted `initChild`/`renderChild`/
 * `@bf-child:` under the LOCAL alias name (`'Bar'`) while the child's own
 * module self-registers under its DECLARED/exported name
 * (`hydrate('Foo', ...)`). The registry is keyed by string name, so the
 * lookup missed and the child's hydration (onMount, event wiring, everything)
 * silently never ran.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJs(source: string, components?: Record<string, string>): string {
  const result = compileJSX(source, 'Parent.tsx', { adapter, components })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  return result.files.find(f => f.type === 'clientJs')!.content
}

const FOO_SOURCE = `
'use client'
export function Foo({ label }: { label: string }) {
  return <span>{label}</span>
}
`

describe('#2777 — aliased component import resolves to the declared registry name', () => {
  test('a directly-referenced aliased import registers/inits/renders under the declared name', () => {
    const content = clientJs(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Foo as Bar } from './foo'
      export function Parent() {
        const [text, setText] = createSignal('hi')
        return <div><Bar label={text()} /></div>
      }
    `,
      { './foo.tsx': FOO_SOURCE },
    )
    expect(content).toContain("initChild('Foo'")
    expect(content).toContain("renderChild('Foo'")
    expect(content).toContain('@bf-child:Foo')
    expect(content).not.toMatch(/(initChild|renderChild|createComponent)\('Bar'/)
  })

  test('an aliased import referenced inside a `.map()` row registers under the declared name (`upsertChild`)', () => {
    const content = clientJs(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Foo as Bar } from './foo'
      export function Parent() {
        const [items, setItems] = createSignal([{ id: 1, label: 'a' }])
        return <ul>{items().map((item) => <li key={item.id}><Bar label={item.label} /></li>)}</ul>
      }
    `,
      { './foo.tsx': FOO_SOURCE },
    )
    expect(content).toContain("upsertChild(__el, 'Foo'")
    expect(content).toContain("renderChild('Foo'")
    expect(content).not.toContain("'Bar'")
  })

  test('a bare (non-aliased) named import is unaffected', () => {
    const content = clientJs(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Foo } from './foo'
      export function Parent() {
        const [text, setText] = createSignal('hi')
        return <div><Foo label={text()} /></div>
      }
    `,
      { './foo.tsx': FOO_SOURCE },
    )
    expect(content).toContain("initChild('Foo'")
    expect(content).toContain('@bf-child:Foo')
  })

  test('an aliased import does not steal a same-file PRIVATE sibling of the same declared name (collision guard)', () => {
    // `Foo` here is a private (non-exported), same-file sibling that would
    // normally be hashed to `Foo__<8hex>` (component-scope.ts's
    // non-exported-sibling disambiguation) — the import alias lookup must
    // win before that rewrite, and referencing the PRIVATE sibling directly
    // must still hash as before.
    const content = clientJs(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Foo as Bar } from './foo'

      function Foo({ label }: { label: string }) {
        return <em>{label}</em>
      }

      export function Parent() {
        const [text, setText] = createSignal('hi')
        return <div><Bar label={text()} /><Foo label="local" /></div>
      }
    `,
      { './foo.tsx': FOO_SOURCE },
    )
    expect(content).toContain("initChild('Foo'")
    expect(content).toMatch(/initChild\('Foo__[0-9a-f]{8}'/)
    expect(content).not.toMatch(/(initChild|renderChild|createComponent)\('Bar'/)
  })
})
