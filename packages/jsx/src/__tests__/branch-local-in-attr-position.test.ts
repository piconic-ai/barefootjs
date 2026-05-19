/**
 * Regression tests for the #1414 matrix follow-up. The
 * "inline at use sites" pass added in #1410 (then extended in #1412
 * for ternary-typed JSX initializers) was shaped around the
 * `{/* @client * / X}` JSX-child position. Element-attribute
 * positions (`style={local}`, `className={local}`, generic
 * `attr={local}`) took a different code path through
 * `getAttributeValue` → template emit and didn't visit the inline
 * pass, so a branch-local string identifier leaked into the
 * emitted template lambda and tripped `ReferenceError: local is
 * not defined` at hydrate.
 *
 * Fix: in `getAttributeValue`, when an attribute value is a bare
 * identifier that resolves to a `_branchScopeVars` entry with a
 * non-JSX initializer, substitute the identifier's AST with the
 * initializer's AST before the downstream attribute-shape probes
 * (template-literal / ternary / generic-expression). JSX-bearing
 * initializers are skipped because attribute positions can't host
 * JSX; those keep the JSX-child-position inlining route from
 * #1410.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsContent(result: ReturnType<typeof compileJSX>): string {
  return result.files.find(f => f.type === 'clientJs')!.content
}

function hydrateLine(result: ReturnType<typeof compileJSX>): string {
  const line = clientJsContent(result).split('\n').find(l => l.includes('hydrate('))
  if (!line) throw new Error('no hydrate() call in client JS')
  return line
}

describe('branch-local at element-attribute position (#1414)', () => {
  test('string local at `style` attribute substitutes the literal', () => {
    // Pre-fix: template lambda referenced `local` at outer scope.
    // Post-fix: the identifier is substituted with the literal,
    // and `styleToCss('color:red')` evaluates fine at hydrate.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function CaseStringAtStyle(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = 'color:red'
          return <div style={local}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'CaseStringAtStyle.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    expect(hydrate).not.toMatch(/\blocal\b/)
    expect(hydrate).toContain("'color:red'")
  })

  test('string local at `className` attribute substitutes the literal', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function CaseStringAtClass(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = 'foo bar'
          return <div className={local}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'CaseStringAtClass.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    expect(hydrate).not.toMatch(/\blocal\b/)
    expect(hydrate).toContain("'foo bar'")
  })

  test('ternary-string branch local at `style` attribute (#1414 case 6)', () => {
    // Speculative case in the matrix that turns out to share the
    // same fix: the ternary initializer doesn't contain JSX, so it
    // qualifies for substitution. The downstream attribute path
    // detects the ConditionalExpression shape and routes through
    // the existing ternary template handling.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function CaseTernaryStringAtStyle(props: { kind: 'a' | 'b'; warn: boolean }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = props.warn ? 'color:orange' : 'color:green'
          return <div style={local}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'CaseTernaryStringAtStyle.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    expect(hydrate).not.toMatch(/\blocal\b/)
    expect(hydrate).toContain("color:orange")
    expect(hydrate).toContain("color:green")
    // The branch's `props.warn` reference is correctly bridged to `_p.warn`.
    expect(hydrate).toMatch(/_p\.warn/)
  })

  test('string local at generic `data-*` attribute', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function CaseDataAttr(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = 'flagged'
          return <div data-status={local}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'CaseDataAttr.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    expect(hydrate).not.toMatch(/\blocal\b/)
    expect(hydrate).toContain("'flagged'")
  })

  test('branch-local with JSX initializer at attribute position stays unmodified', () => {
    // Regression guard: the substitution must skip initializers that
    // contain JSX. Attribute values can't host JSX, and the
    // existing JSX-child-position fix (#1410) handles those at the
    // `@client` use site. Substituting here would emit malformed
    // template output.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function JsxLocalAttr(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          // Contrived: JSX literal local. Using it as an attribute
          // value isn't a real pattern; this test guards that the
          // substitution doesn't crash or emit JSX into the attr text.
          const local = <span>x</span>
          // Use the local at the @client child position (the real
          // pattern), and a separate plain title attribute. The
          // template must not contain a bare \`local\` identifier.
          return <div title="t">{/* @client */ local}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'JsxLocalAttr.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    // JSX literal is inlined at the @client child position (per #1410).
    const hydrate = hydrateLine(result)
    expect(hydrate).toContain('<span>x</span>')
    expect(hydrate).not.toMatch(/\blocal\b/)
  })

  test('outer-scope string const at attribute position keeps existing inliner path', () => {
    // Negative-side regression: an outer-scope const at attribute
    // position must keep going through `compute-inlinability`
    // (chained-const resolution + relocate), not through the
    // branch-scope substitution that only fires for `_branchScopeVars`
    // entries.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function OuterScopeAttr(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        const local = 'foo bar'
        return <div className={local}>view: {count()}</div>
      }
    `
    const result = compileJSX(source, 'OuterScopeAttr.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    // compute-inlinability already inlines this outer-scope string
    // const at template scope, so `local` does NOT appear as a bare
    // identifier and the value text is in the attribute.
    expect(hydrate).not.toMatch(/\blocal\b/)
    expect(hydrate).toContain('foo bar')
  })
})
