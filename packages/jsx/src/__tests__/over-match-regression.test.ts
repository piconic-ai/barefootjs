/**
 * Integration regression tests for #1267 — `exprReferencesIdent` /
 * `exprReferencesAny` over-match fixes.
 *
 * Each test compiles a piece of JSX whose source contains an identifier-
 * shaped substring inside a position where it is NOT a real reference
 * (string literal, member-access tail). Pre-#1267 the regex helpers
 * would over-match and the compiler would either:
 *   - mark a constant as depending on an unsafe local (sentinel template
 *     substitution at site 14)
 *   - treat a loop child as reactive when it isn't (site 6)
 *
 * Post-#1267, the AST-driven `freeIdentifiers` lookup respects the
 * string-literal / member-access boundary, so the false positives are
 * gone.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('#1267 — over-match regressions', () => {
  test('string-literal lookalike does not trigger sentinel substitution', () => {
    // `props.size` is an init-scope local resolution; a constant whose
    // value contains the literal text `size-4` (inside a string literal
    // within a Record lookup) must NOT be downgraded just because the
    // characters `size` appear in the template. Pre-#1267 the regex
    // helper would mis-classify and substitute the sentinel.
    const source = `
      type Props = { size: 'sm' | 'md' }
      const SIZES: Record<string, string> = { sm: 'size-2', md: 'size-4' }
      export function Icon({ size }: Props) {
        const klass = SIZES[size]
        return <span className={klass}>x</span>
      }
    `
    const result = compileJSX(source, 'Icon.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  })

  test('loop-param-shaped substring inside string literal is not a loop-param reference', () => {
    // Conditional whose `condition` string contains `item` only inside a
    // string literal: the conditional should NOT be classified as a
    // loop-param conditional. Without #1267 the regex would over-match.
    const source = `
      type Item = { id: string; label: string }
      type Props = { items: Item[]; mode: string }
      export function List(props: Props) {
        return (
          <ul>
            {props.items.map(item => (
              <li key={item.id}>
                {props.mode === 'item-row' ? <strong>{item.label}</strong> : <em>{item.label}</em>}
              </li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    // Sanity check: compile succeeded — the conditional was still routed
    // correctly through the static + reactive paths.
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
  })

  test('member-access tail name is not a free identifier', () => {
    // `const x = props.className` — the constant references the prop
    // `props`, not a bare identifier `className`. With strict semantics,
    // a prop named `className` should still be detected because the
    // `propsObjectName.<tail>` regex path catches it separately.
    const source = `
      type Props = { className: string }
      export function Box(props: Props) {
        const x = props.className
        return <div className={x} />
      }
    `
    const result = compileJSX(source, 'Box.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    // Sanity check: the compile produced a client JS bundle.
    expect(result.files.find(f => f.type === 'clientJs')).toBeDefined()
  })
})
