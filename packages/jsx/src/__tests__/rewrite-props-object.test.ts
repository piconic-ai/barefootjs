/**
 * Unit tests for the AST-based props-object rename
 * (`ir-to-client-js/rewrite-props-object.ts`).
 *
 * Documents the AST-correct exclusions that the pre-C2 regex hack
 * (`\\b<propsObjectName>\\b`) silently broke. Today's corpus happens to
 * not collide with these forms, but new emission shapes downstream
 * could trip the regex form — these tests pin the AST behaviour.
 */

import { describe, test, expect } from 'bun:test'
import { rewritePropsObjectRef } from '../ir-to-client-js/rewrite-props-object'

describe('rewritePropsObjectRef', () => {
  test('rewrites `props.x` value-position reads to `_p.x`', () => {
    const out = rewritePropsObjectRef('const name = props.name', 'props')
    expect(out).toBe('const name = _p.name')
  })

  test('rewrites multiple references in one line', () => {
    const out = rewritePropsObjectRef('const x = props.a + props.b', 'props')
    expect(out).toBe('const x = _p.a + _p.b')
  })

  test('does NOT rewrite object literal keys (regex hack regression guard)', () => {
    // `{ props: x }` — the `props` here is a key, not a value reference.
    // The legacy regex `\\b<name>\\b` would have rewritten this; the AST
    // walker correctly skips it.
    const out = rewritePropsObjectRef('const obj = { props: 1 }', 'props')
    expect(out).toBe('const obj = { props: 1 }')
  })

  test('does NOT rewrite property access names', () => {
    // `obj.props` — `props` is a property name, not a receiver.
    const out = rewritePropsObjectRef('const x = obj.props', 'props')
    expect(out).toBe('const x = obj.props')
  })

  test('does NOT rewrite shorthand property keys', () => {
    // `{ props }` is shorthand for `{ props: props }`. The key slot must
    // stay; in well-formed init body the value slot would be a separate
    // identifier (and we wouldn't see this pattern), but the test pins
    // the safe behaviour.
    const out = rewritePropsObjectRef('const obj = { props }', 'props')
    expect(out).toBe('const obj = { props }')
  })

  test('does NOT touch occurrences inside string literals', () => {
    const out = rewritePropsObjectRef('const s = "props.name"', 'props')
    expect(out).toBe('const s = "props.name"')
  })

  test('does NOT touch occurrences inside line comments', () => {
    const out = rewritePropsObjectRef('// reads props.name later\nconst x = 1', 'props')
    expect(out).toBe('// reads props.name later\nconst x = 1')
  })

  test('handles user-supplied object names (e.g. `p`)', () => {
    const out = rewritePropsObjectRef('const name = p.name', 'p')
    expect(out).toBe('const name = _p.name')
  })

  test('no-op when propsObjectName is null and no restPropsName is given', () => {
    // #2723: the historical `propsObjectName ?? 'props'` fallback rewrote
    // ANY bare `props` identifier here, on the (usually-true, but
    // accidental) assumption that a destructured component's discarded
    // rest binding was always spelled literally "props" — real
    // destructured-props mode has no such binding to rewrite at all, so
    // this must be a true no-op, matching the function's own docstring.
    const code = 'const x = props.name'
    const out = rewritePropsObjectRef(code, null)
    expect(out).toBe(code)
  })

  test('rewrites via restPropsName when propsObjectName is null (#2723)', () => {
    // The destructured-props shape this exists for: `function F({ a,
    // ...rest })` has no `propsObjectName` at all, but a `const
    // rest__alias = rest` hop (or any other bare read of the rest
    // binding) still needs `rest` rewritten to `_p`.
    const out = rewritePropsObjectRef('const restAlias = rest', null, 'rest')
    expect(out).toBe('const restAlias = _p')
  })

  test('restPropsName rewrite is not tied to the literal name "props"', () => {
    // Regression guard for the bug the widened fallback replaced: a rest
    // binding named anything OTHER than "props" left the reference
    // dangling (a runtime ReferenceError) because the old fallback only
    // ever guessed the literal word "props".
    const out = rewritePropsObjectRef('const leftoverAlias = leftover', null, 'leftover')
    expect(out).toBe('const leftoverAlias = _p')
  })

  test('rewrites BOTH propsObjectName and restPropsName when both are set', () => {
    // A `(props)`-arg component that ALSO body-destructures a rest
    // binding out of it (`const { a, ...rest } = props`) has both names
    // live in the same init body.
    const out = rewritePropsObjectRef('const x = props.a + rest.b', 'props', 'rest')
    expect(out).toBe('const x = _p.a + _p.b')
  })

  test('restPropsName defaulting to null preserves the two-arg call shape', () => {
    // Existing call sites that only ever passed `propsObjectName` (the
    // pre-#2723 signature) must keep working unchanged.
    const out = rewritePropsObjectRef('const name = props.name', 'props')
    expect(out).toBe('const name = _p.name')
  })

  test('no-op when propsObjectName equals _p', () => {
    const code = 'const x = _p.name'
    const out = rewritePropsObjectRef(code, '_p')
    expect(out).toBe(code)
  })

  test('rewrites inside template literals', () => {
    const out = rewritePropsObjectRef('const s = `name=${props.name}`', 'props')
    expect(out).toBe('const s = `name=${_p.name}`')
  })

  test('does NOT rewrite identifiers that share a substring', () => {
    // `propsX` is a different identifier; must not be partially matched.
    const out = rewritePropsObjectRef('const x = propsX.name', 'props')
    expect(out).toBe('const x = propsX.name')
  })
})
