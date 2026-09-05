/**
 * MathML-rooted loop item templates cloned via `template.innerHTML` (#1096).
 *
 * MathML port of `inner-loop-svg-namespace.test.ts` (#2219, #135/#1088).
 * `template.innerHTML` parses in the HTML namespace, so an inner reactive
 * loop whose item root is a MathML element (`<mrow>`, `<mfrac>`, ...)
 * clones as an `HTMLUnknownElement` — present in the DOM but never drawn
 * by the MathML renderer, with no error. This mirrors the SVG fix: parse
 * `<math>${template}</math>` and descend one extra level
 * (`.firstElementChild.firstElementChild`). HTML-rooted templates keep
 * byte-identical output.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('inner reactive loop with a MathML element root (#1096)', () => {
  test('MathML-rooted inner item clones inside a synthetic <math> wrap', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Sheet { id: number; terms: number[] }
      export function Repro() {
        const [sheets] = createSignal<Sheet[]>([])
        return (
          <div>
            {sheets().map((s) => (
              <math key={s.id}>
                {s.terms.map((n) => (
                  <mn key={n}>{String(n)}</mn>
                ))}
              </math>
            ))}
          </div>
        )
      }
    `)

    // The inner renderItem clone parses inside `<math>...</math>` and
    // descends one extra level to reach the real `<mn>` root.
    expect(content).toMatch(/__t\.innerHTML = `<math><mn /)
    expect(content).toContain('return __t.content.firstElementChild.firstElementChild.cloneNode(true)')
  })

  test('conditional inner body whose branches are all MathML wraps too (#1088 shape)', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Sheet { id: number; terms: number[] }
      export function Repro() {
        const [sheets] = createSignal<Sheet[]>([])
        return (
          <div>
            {sheets().map((s) => (
              <math key={s.id}>
                {s.terms.map((n) => (
                  n > 50
                    ? <mn key={n}>{String(n)}</mn>
                    : <mi key={n}>x</mi>
                ))}
              </math>
            ))}
          </div>
        )
      }
    `)

    expect(content).toMatch(/__t\.innerHTML = `<math>\$\{/)
    expect(content).toContain('return __t.content.firstElementChild.firstElementChild.cloneNode(true)')
  })
})

describe('reactive multi-root fragment with a <math>-container first root (#2233-shape review)', () => {
  test('emitMultiRootTemplateCloneLines skips the wrap for <math>-first fragments', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Eq { id: number; n: number }
      export function Repro() {
        const [eqs] = createSignal<Eq[]>([])
        return (
          <div>
            {eqs().map((e) => (
              <>
                <math key={e.id}><mn>{String(e.n)}</mn></math>
                <span>{e.id}</span>
              </>
            ))}
          </div>
        )
      }
    `)

    // The multi-root clone parses the fragment bare — no synthetic wrap —
    // so the HTML <span> sibling stays in the HTML namespace.
    expect(content).not.toContain('`<math><math')
    expect(content).toContain('__tpl.content.firstElementChild.cloneNode(true)')
  })
})

describe('static-loop CSR materialize with a MathML element root (#1096, #1247 path)', () => {
  test('MathML-rooted materialize clone wraps and descends the extra level', () => {
    const content = clientJsFor(`
      'use client'
      type Props = { terms: Record<string, number> }
      export function Repro(props: Props) {
        const entries = Object.entries(props.terms ?? {}).filter(([, n]) => n > 0)
        return (
          <math>
            {entries.map(([id, n]) => (
              <mn key={id}>{String(n)}</mn>
            ))}
          </math>
        )
      }
    `)

    // Materialize branch present (unsafe prop-derived array, #1247) ...
    expect(content).toMatch(/if \(!__iterEl\)/)
    // ... and its template parse is namespace-aware.
    expect(content).toMatch(/__tpl\.innerHTML = withParentScope\(__scopeId, \(\) => `<math><mn /)
    expect(content).toContain('const __cloned = __tpl.content.firstElementChild.firstElementChild')
  })
})
