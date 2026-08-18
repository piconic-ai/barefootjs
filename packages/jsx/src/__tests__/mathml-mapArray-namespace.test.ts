/**
 * BarefootJS Compiler - MathML mapArray namespace preservation (#1096).
 *
 * MathML port of `svg-mapArray-namespace.test.ts` (#135/#1088). When a
 * `.map()` inside a `<math>` produces MathML elements (e.g. `<mrow>`,
 * `<mfrac>`), the compiler-generated `renderItem` must parse its template
 * under MathML context. The default `template.innerHTML = '<mrow/>'`
 * produces an `HTMLUnknownElement` in xhtml namespace, so the MathML
 * renderer ignores it — same parser quirk as the SVG case, just a smaller
 * element vocabulary.
 *
 * Fix: wrap the `innerHTML` in `<math>...</math>` and descend one extra
 * level when the loop body's root tag is a MathML element. This shares
 * every byte of the wrap machinery with the SVG fix through
 * `detectRootNamespaceWrapTag` / `namespaceWrapForTemplate` in
 * `stringify/template-parse.ts` — only the wrap tag name differs.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('MathML mapArray namespace preservation (#1096)', () => {
  test('MathML mrow/mfrac mapArray wraps innerHTML with <math> for correct namespace (issue repro shape)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Term { key: string; n: string; d: string }

      export function Equation() {
        const [terms] = createSignal<Term[]>([])
        return (
          <math>
            {terms().map((t) => (
              <mrow key={t.key}>
                <mfrac>
                  <mn>{t.n}</mn>
                  <mn>{t.d}</mn>
                </mfrac>
              </mrow>
            ))}
          </math>
        )
      }
    `
    const result = compileJSX(source, 'Equation.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // Must wrap with <math>...</math> for foreign-content parsing
    expect(content).toContain('<math>')
    expect(content).toContain('</math>')
    // Descend one extra level
    expect(content).toContain('.firstElementChild.firstElementChild.cloneNode(true)')
    // The plain HTML clone path must NOT be used for MathML roots
    expect(content).not.toMatch(/__tpl\.innerHTML = `<mrow[^`]*`/)
  })

  test('HTML li mapArray is unchanged (no MathML wrapping)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Item { id: string; label: string }

      export function L() {
        const [items, setItems] = createSignal<Item[]>([])
        return (
          <ul>
            {items().map((it) => (
              <li key={it.id}>{it.label}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'L.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    expect(content).toContain('.firstElementChild.cloneNode(true)')
    expect(content).not.toContain('.firstElementChild.firstElementChild.cloneNode(true)')
    expect(content).not.toContain('<math>')
  })

  /**
   * #1088-shape port: when a `.map()` body is a ternary whose branches are
   * all MathML tags, the wrap heuristic must still apply.
   */
  test('MathML ternary body wraps when both branches are MathML-rooted', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Term = { key: string; kind: 'frac' | 'sup'; value: string }

      export function CondMap() {
        const [terms] = createSignal<Term[]>([])
        return (
          <math>
            {terms().map((t) =>
              t.kind === 'frac'
                ? <mfrac key={t.key}><mn>1</mn><mn>{t.value}</mn></mfrac>
                : <msup key={t.key}><mn>{t.value}</mn><mn>2</mn></msup>
            )}
          </math>
        )
      }
    `
    const result = compileJSX(source, 'CondMap.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // Wrap with <math>...</math> for foreign-content parsing
    expect(content).toMatch(/__tpl\.innerHTML = `<math>\$\{/)
    expect(content).toMatch(/\}<\/math>`/)
    // Descend one extra level
    expect(content).toContain('.firstElementChild.firstElementChild.cloneNode(true)')
  })

  test('MathML 3-way ternary wraps recursively', () => {
    // Mirrors the SVG "PolarGrid" 3-way-ternary regression pin: the
    // compiler nests the inner conditional inside
    // `<!--bf-cond-start:sX-->` markers, so the wrap heuristic must skip
    // those and recurse into the inner `${...}`.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Term = { key: string; kind: 'frac' | 'sup' | 'sub' }

      export function TermList() {
        const [terms] = createSignal<Term[]>([])
        return (
          <math>
            {terms().map((t) =>
              t.kind === 'frac'
                ? <mfrac key={t.key}><mn>1</mn><mn>2</mn></mfrac>
                : t.kind === 'sup'
                  ? <msup key={t.key}><mn>1</mn><mn>2</mn></msup>
                  : <msub key={t.key}><mn>1</mn><mn>2</mn></msub>
            )}
          </math>
        )
      }
    `
    const result = compileJSX(source, 'TermList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    expect(content).toMatch(/__tpl\.innerHTML = `<math>\$\{/)
    expect(content).toContain('.firstElementChild.firstElementChild.cloneNode(true)')
  })

  test('mixed HTML/MathML ternary body falls through to no-wrap', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Item = { key: string; useMath: boolean }

      export function Mixed() {
        const [items] = createSignal<Item[]>([])
        return (
          <div>
            {items().map((i) =>
              i.useMath
                ? <mn key={i.key}>1</mn>
                : <span key={i.key}>x</span>
            )}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Mixed.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    expect(content).toContain('.firstElementChild.cloneNode(true)')
    expect(content).not.toContain('.firstElementChild.firstElementChild.cloneNode(true)')
  })

  test('mixed SVG/MathML ternary body falls through to no-wrap', () => {
    // Neither namespace should silently win: an SVG branch and a MathML
    // branch in the same ternary is out of scope for the wrap heuristic,
    // same as the pre-existing mixed HTML/SVG case.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Item = { key: string; useSvg: boolean }

      export function MixedNs() {
        const [items] = createSignal<Item[]>([])
        return (
          <div>
            {items().map((i) =>
              i.useSvg
                ? <circle key={i.key} cx="0" cy="0" r="5" />
                : <mn key={i.key}>1</mn>
            )}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'MixedNs.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    expect(content).toContain('.firstElementChild.cloneNode(true)')
    expect(content).not.toContain('.firstElementChild.firstElementChild.cloneNode(true)')
    expect(content).not.toContain('<svg>')
    expect(content).not.toContain('<math>')
  })
})
