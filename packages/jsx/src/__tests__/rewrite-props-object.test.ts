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

  test('still rewrites a literal `props` read when propsObjectName is null', () => {
    // The `propsObjectName ?? 'props'` fallback survives the #2723 work.
    // A destructured component can still write `props.itemId` inside a
    // handler body — `propsObjectName` is null for that shape, so without
    // the fallback the emitted init keeps a `props` reference that no
    // binding satisfies (the doc-example `StatementExample` regressed
    // exactly this way before the fallback was restored).
    const out = rewritePropsObjectRef('const x = props.name', null)
    expect(out).toBe('const x = _p.name')
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

  describe('an inner binding of the same name shadows the props object', () => {
    // The client JS reads the component's props through `_p`. A callback
    // parameter or local spelled like the props object belongs to its own
    // binding inside its scope: renaming it too would make every `_p.<prop>`
    // read the compiler emits inside that scope (a destructured prop, a
    // forwarded child prop) read the parameter instead.
    test('a loop row callback param keeps its name; the outer `_p` read stays outer', () => {
      const code = 'mapArray(() => items(), el, (props) => String(props.id), (props) => props().label + _p.suffix)'
      expect(rewritePropsObjectRef(code, null)).toBe(code)
    })

    test('a row accessor `const props = () => __e.item` keeps its name', () => {
      const code = 'const row = (__e) => {\n  const props = () => __e.item\n  return props().label + _p.suffix\n}'
      expect(rewritePropsObjectRef(code, null)).toBe(code)
    })

    test('a handler arrow param and a nested function param keep their names', () => {
      const code = 'const bump = (props) => set(props.by * _p.step)\nfunction describe(props) { return props.label + _p.suffix }'
      expect(rewritePropsObjectRef(code, null)).toBe(code)
    })

    test('references outside the shadowing scope are still rewritten', () => {
      const out = rewritePropsObjectRef('const a = props.x\nconst f = (props) => props.y\nconst b = props.z', 'props')
      expect(out).toBe('const a = _p.x\nconst f = (props) => props.y\nconst b = _p.z')
    })

    test('a rest binding name is shadowed the same way', () => {
      const out = rewritePropsObjectRef('const a = rest\nconst f = (rest) => rest.y', null, 'rest')
      expect(out).toBe('const a = _p\nconst f = (rest) => rest.y')
    })
  })

  describe('`var` is function-scoped', () => {
    test('a `var props` in a nested block binds for the whole enclosing function', () => {
      const code = 'const f = () => { if (c) { var props = { by: 2 } } return props.by }\nconst g = props.x'
      expect(rewritePropsObjectRef(code, null)).toBe('const f = () => { if (c) { var props = { by: 2 } } return props.by }\nconst g = _p.x')
    })

    test('a `for (var props …)` head binds after the loop, but not outside its function', () => {
      const code = 'function f() { for (var props = 0; props < 3; props++) {} return props }\nconst g = props.x'
      expect(rewritePropsObjectRef(code, null)).toBe('function f() { for (var props = 0; props < 3; props++) {} return props }\nconst g = _p.x')
    })

    test('a `var` inside a nested function does not leak into the outer one', () => {
      const code = 'const f = () => { const h = () => { var props = 1; return props }; return props.x }'
      expect(rewritePropsObjectRef(code, null)).toBe('const f = () => { const h = () => { var props = 1; return props }; return _p.x }')
    })
  })

  describe('a parameter default does not see the body\'s declarations', () => {
    test('a default reads the props object despite a same-named body `var`', () => {
      const code = 'const f = (v = props.x) => { var props = 1; return v + props }'
      expect(rewritePropsObjectRef(code, null)).toBe('const f = (v = _p.x) => { var props = 1; return v + props }')
    })

    test('a default reads the props object despite a same-named body `let`', () => {
      const code = 'function f(v = props.x) { let props = 1; return v + props }'
      expect(rewritePropsObjectRef(code, null)).toBe('function f(v = _p.x) { let props = 1; return v + props }')
    })

    test('a default sees an earlier parameter of the same name, not the props object', () => {
      const code = 'const f = (props, v = props.x) => v'
      expect(rewritePropsObjectRef(code, null)).toBe(code)
    })
  })

  describe('a class static block owns its `var`s', () => {
    test('a read inside the block is local; a read after the class is the props object', () => {
      const code = 'const f = () => { class C { static { var props = 1; C.p = props } }; return props.x }'
      expect(rewritePropsObjectRef(code, null)).toBe('const f = () => { class C { static { var props = 1; C.p = props } }; return _p.x }')
    })

    test('a `var` in a method or a field-initializer arrow does not leak into the enclosing function', () => {
      const code = 'const f = () => { class C { m() { var props = 1; return props } g = () => { var props = 2; return props } }; return props.x }'
      expect(rewritePropsObjectRef(code, null)).toBe('const f = () => { class C { m() { var props = 1; return props } g = () => { var props = 2; return props } }; return _p.x }')
    })
  })

  describe('a computed method name is read in the enclosing scope', () => {
    test('the key reads the props object; the body reads the parameter', () => {
      const code = 'const o = { [props.k](props) { return props } }'
      expect(rewritePropsObjectRef(code, null)).toBe('const o = { [_p.k](props) { return props } }')
    })

    test('the same holds for a class method and an accessor', () => {
      const code = 'class C { [props.a](props) { return props } get [props.b]() { const props = 1; return props } }'
      expect(rewritePropsObjectRef(code, null)).toBe('class C { [_p.a](props) { return props } get [_p.b]() { const props = 1; return props } }')
    })
  })
})
