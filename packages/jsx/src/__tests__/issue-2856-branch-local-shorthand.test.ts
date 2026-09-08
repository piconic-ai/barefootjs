/**
 * #2856: `replaceBranchLocalRefs` (jsx-to-ir.ts) used to substitute a
 * branch-local's occurrences via a plain regex token scanner
 * (`replaceInExprContexts`), which has no notion of AST position. An
 * object-literal shorthand property (`{ local }`, simultaneously the
 * key and the value) got its substitution wrapped in parens with the
 * key silently dropped — `{ (_p.tag) }` — invalid JS that broke the
 * whole client bundle's parse at runtime with no compile-time
 * diagnostic.
 *
 * The fix routes both call sites through `rewriteScopedValueRefs`
 * (`prop-rewrite.ts`), the same AST-based, scope-aware walk that
 * already handled this exact key/value duality for destructured props
 * (#2828/#2853). These tests pin the general mechanism directly
 * (`rewriteScopedValueRefs`) — shorthand expansion, and the three
 * sibling positions a naive scanner conflates with a value reference:
 * a member-access name, an explicit object-literal key, and a name
 * shadowed by an inner binding. An end-to-end compiler regression for
 * the issue's own repro lives in
 * `rewrite-destructured-props.test.ts` ("branch-local transitive
 * prop-dep via shorthand reference").
 */
import { describe, test, expect } from 'bun:test'
import { rewriteScopedValueRefs } from '../prop-rewrite.ts'

describe('rewriteScopedValueRefs (#2856)', () => {
  test('expands an object-literal shorthand property to `name: value`', () => {
    const out = rewriteScopedValueRefs('{ local }', new Set(['local']), () => '(_p.tag)')
    expect(out).toBe('{ local: (_p.tag) }')
  })

  test('does not touch a member-access name that merely shares the branch-local name', () => {
    const out = rewriteScopedValueRefs('obj.local', new Set(['local']), () => '(_p.tag)')
    expect(out).toBe('obj.local')
  })

  test('does not touch an explicit object-literal key', () => {
    const out = rewriteScopedValueRefs('{ local: 1 }', new Set(['local']), () => '(_p.tag)')
    expect(out).toBe('{ local: 1 }')
  })

  test('does not substitute a name shadowed by an inner arrow parameter', () => {
    const out = rewriteScopedValueRefs('[1, 2, 3].map((local) => local)', new Set(['local']), () => '(_p.tag)')
    expect(out).toBe('[1, 2, 3].map((local) => local)')
  })

  test('substitutes a real value reference alongside an unrelated shadowed one', () => {
    const out = rewriteScopedValueRefs(
      'local + [1, 2, 3].map((local) => local).join(",")',
      new Set(['local']),
      () => '(_p.tag)',
    )
    expect(out).toBe('(_p.tag) + [1, 2, 3].map((local) => local).join(",")')
  })

  test('does not touch a destructuring declaration\'s source key (pullfrog review, #2889)', () => {
    // `{ local: renamed } = obj` -- `local` here is the SOURCE key of a
    // renamed destructuring binding, not a value reference. Distinct from
    // the shorthand case above: a renamed destructuring pattern has BOTH
    // `propertyName` (the source key) and `name` (the local binding), and
    // only the latter was excluded pre-fix.
    const out = rewriteScopedValueRefs(
      '(el) => { const { local: renamed } = obj; use(renamed) }',
      new Set(['local']),
      () => '(_p.tag)',
    )
    expect(out).toBe('(el) => { const { local: renamed } = obj; use(renamed) }')
  })

  test('resolves inside a template-literal interpolation hole, leaving the cooked text alone', () => {
    const out = rewriteScopedValueRefs('`label:local=${local}`', new Set(['local']), () => '(_p.tag)')
    expect(out).toBe('`label:local=${(_p.tag)}`')
  })

  test('returns null for text that does not parse as an expression when allowStatements is not set', () => {
    const out = rewriteScopedValueRefs('const x = local', new Set(['local']), () => '(_p.tag)')
    expect(out).toBeNull()
  })

  test('with allowStatements, resolves a value reference in statement-shaped text', () => {
    const out = rewriteScopedValueRefs('const x = local', new Set(['local']), () => '(_p.tag)', {
      allowStatements: true,
    })
    expect(out).toBe('const x = (_p.tag)')
  })
})
