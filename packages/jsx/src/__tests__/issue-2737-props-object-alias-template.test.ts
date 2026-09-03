/**
 * #2737 — a local `const` alias of the WHOLE props object
 * (`const props__alias = props`) leaks the pre-rewrite name into a
 * component's CSR template.
 *
 * `props__alias` is itself a plain reactive/const-inlinable reference to
 * `props`, so constant inlining correctly substitutes it — but as
 * `(props)`, a PARENTHESISED receiver. `html-template.ts`'s four
 * template-builder `transformExpr`/`transformJs` closures each ran their
 * own `\bpropsObjectName\.` regex to rewrite `props.x` → `_p.x`; that
 * regex requires `props` to be immediately followed by `.`, so `(props).x`
 * survived untouched. The init body's own rewrite (`rewritePropsObjectRef`,
 * an AST walk) never had this gap, since it isn't a regex — this fix
 * makes the four template sites call the SAME function instead of their
 * own copies.
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

describe('#2737 — props-object alias resolves in the CSR template', () => {
  test('a SolidJS-style component whose whole `props` is aliased emits `(_p)`, not `(props)`', () => {
    const content = clientJs(`
      "use client";
      export function ReactiveChild(props: { label: string; onIncrement: () => void }) {
        const props__alias = props
        return (
          <div>
            <span>{props__alias.label}</span>
            <button onClick={() => props__alias.onIncrement()}>+</button>
          </div>
        )
      }
    `)
    expect(content).toContain('(_p).label')
    expect(content).not.toMatch(/\(props\)\./)
  })

  test('the same alias inside a loop row still resolves (shadow guard does not over-fire on the outer name)', () => {
    const content = clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function Row(props: { items: Array<{ id: number; label: string }> }) {
        const props__alias = props
        return (
          <ul>
            {props__alias.items.map(item => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(content).toContain('(_p).items')
    expect(content).not.toMatch(/\(props\)\./)
  })

  test('a `.map()` row PARAMETER literally named `props` is not rewritten (shadow guard)', () => {
    // The outer component's props object happens to share a name with a
    // loop callback's own parameter — the parameter binds a per-row VALUE,
    // not the outer props object, and must not be rewritten to `_p`.
    const content = clientJs(`
      "use client";
      export function List(items: never) {
        const rows = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]
        return (
          <ul>
            {rows.map(props => (
              <li key={props.id}>{props.name}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(content).not.toContain('_p.name')
    expect(content).toContain('props.name')
  })
})
