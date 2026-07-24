/**
 * Unsupported Expression Error Tests
 *
 * Tests for BF021: Emit compile error when a filter predicate cannot be
 * compiled to marked template and @client is not present.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { compileJSX } from '../compiler'
import { ErrorCodes } from '../errors'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

/**
 * Helper: analyze and transform to IR, returning errors from ctx.
 */
function compileToIR(source: string) {
  const ctx = analyzeComponent(source, 'Test.tsx')
  const ir = jsxToIR(ctx)
  return { ctx, ir, errors: ctx.errors }
}

describe('Unsupported Expression Error (BF021)', () => {
  // Use `typeof t` in filter predicate — typeof expressions are unsupported
  // by the expression parser for server-side rendering.
  const unsupportedSource = `
    'use client'
    import { createSignal } from '@barefootjs/client'

    export function TodoList() {
      const [items, setItems] = createSignal<any[]>([])
      return (
        <ul>
          {items().filter(t => typeof t === 'string').map(t => (
            <li>{t}</li>
          ))}
        </ul>
      )
    }
  `

  test('emits BF021 error for unsupported filter predicate', () => {
    const { errors } = compileToIR(unsupportedSource)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(1)
    expect(bf021[0].severity).toBe('error')
  })

  test('@client suppresses BF021 error', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {/* @client */ items().filter(t => typeof t === 'string').map(t => (
              <li>{t}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(0)
  })

  test('no BF021 error for supported filter predicate', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [todos, setTodos] = createSignal<any[]>([])
        return (
          <ul>
            {todos().filter(t => !t.done).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(0)
  })

  test('error message includes the unsupported reason', () => {
    const { errors } = compileToIR(unsupportedSource)
    const bf021 = errors.find(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toBeDefined()
    expect(bf021!.message).toContain('Expression cannot be compiled to marked template')
  })

  test('error includes suggestion to add @client', () => {
    const { errors } = compileToIR(unsupportedSource)
    const bf021 = errors.find(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toBeDefined()
    expect(bf021!.suggestion).toBeDefined()
    expect(bf021!.suggestion!.message).toContain('@client')
  })

  test('IR is still produced despite BF021 error (graceful degradation)', () => {
    const { ir, errors } = compileToIR(unsupportedSource)

    // Error is emitted
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(1)

    // But IR is still produced
    expect(ir).not.toBeNull()
    expect(ir!.type).toBe('element')
  })

  test('compileJSX surfaces IR-phase BF021 for a DSL target (no acceptsCallbackBody)', () => {
    // Model a DSL adapter: its template runtime can't run an off-subset
    // predicate verbatim, so the Phase-1 diagnostic must surface in the result.
    // Real DSL adapters leave `acceptsCallbackBody` unset; the gate
    // (`?.(kind) ?? false`) treats unset and a false-returning predicate
    // identically, so override it to decline every callback kind.
    const dslAdapter = new TestAdapter()
    dslAdapter.acceptsCallbackBody = () => false
    const result = compileJSX(unsupportedSource, 'TodoList.tsx', { adapter: dslAdapter })
    const bf021 = result.errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(1)
    expect(bf021[0].severity).toBe('error')
    expect(bf021[0].message).toContain('Expression cannot be compiled to marked template')
    expect(bf021[0].suggestion?.message).toContain('@client')
  })

  test('compileJSX does NOT raise BF021 for a JS-runtime target (fidelity)', () => {
    // A JS runtime (Hono / CSR — the default TestAdapter, extending JsxAdapter)
    // runs the predicate verbatim, so an off-subset body is not a universal
    // error. It stays in the array string for the runtime to evaluate.
    // See spec/callback-fidelity.md.
    const result = compileJSX(unsupportedSource, 'TodoList.tsx', { adapter })
    const bf021 = result.errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(0)
  })
})

describe('Unsupported Sort Comparator (BF021)', () => {
  test('function-reference comparator resolves through scope — no BF021 (#2090)', () => {
    // #1448 Tier B follow-up widened the catalogue to include
    // multi-key (`a.x - b.x || a.y - b.y`), relational ternary, and
    // single-`return` block bodies. #2090 closes the remaining gap:
    // a bare identifier callback (`arr.sort(cmp)`) is now resolved
    // through the analyzer's scope machinery (one hop, same-file
    // only) to the const-bound arrow, then fed through the same
    // catalogue as an inline comparator.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        const cmp = (a, b) => a.priority - b.priority
        return (
          <ul>
            {items().sort(cmp).map(t => (
              <li key={t.name}>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { ir, errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(0)
    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      expect(loop).toBeDefined()
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(loop.sortComparator!.raw).toBe('a.priority - b.priority')
      }
    }
  })

  test('function-declaration comparator reference resolves — no BF021 (#2090)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function cmp(a, b) { return a.priority - b.priority }

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().toSorted(cmp).map(t => (
              <li key={t.name}>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { ir, errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(0)
    expect(ir).not.toBeNull()
    if (ir!.type === 'element') {
      const loop = ir!.children.find(c => c.type === 'loop')
      if (loop?.type === 'loop') {
        expect(loop.sortComparator).toBeDefined()
        expect(loop.sortComparator!.raw).toBe('a.priority - b.priority')
      }
    }
  })

  test('identifier resolving to a non-function const emits BF021 (#2090)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        const cmp = 5
        return (
          <ul>
            {items().sort(cmp).map(t => (
              <li key={t.name}>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain('could not be resolved')
  })

  test('cross-kind shadowing (component const over module function) emits BF021, not the shadowed function (#2090)', () => {
    // A name bound both as a const and as a `function` declaration can
    // only happen across scopes, and FunctionInfo does not carry lexical
    // scope (component-body functions are hoisted for client emission).
    // Resolution refuses the ambiguity rather than guessing — pre-fix
    // this wrongly compiled against the shadowed module function
    // (Copilot review on #2091).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function cmp(a, b) { return a.priority - b.priority }

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        const cmp = 5
        return (
          <ul>
            {items().sort(cmp).map(t => (
              <li key={t.name}>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain('could not be resolved')
  })

  test('cross-kind shadowing (component function over module const) also refuses with BF021 (#2090)', () => {
    // The safe half of the same ambiguity: JS would use the component
    // function here, but resolution cannot prove which binding the call
    // site sees, so it refuses loudly instead of risking the WRONG
    // (opposite-direction) comparator.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      const byPrice = (a, b) => a.price - b.price

      export function ProductList() {
        const [products, setProducts] = createSignal<any[]>([])
        function byPrice(a, b) { return b.price - a.price }
        return (
          <ul>
            {products().sort(byPrice).map(p => (
              <li key={p.name}>{p.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain('could not be resolved')
  })

  test('unresolved (imported) identifier comparator emits BF021 (#2090)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { cmp } from './cmp'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().sort(cmp).map(t => (
              <li key={t.name}>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain('could not be resolved')
  })

  test('resolved-but-off-catalogue comparator body emits BF021 naming the comparator (#2090)', () => {
    // `a.deep.x - b.deep.x` has operand depth > 1 — `classifySortOperand`
    // only accepts the param itself or a single-level field access, so this
    // stays refused even once the identifier resolves to the arrow.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        const cmp = (a, b) => a.deep.x - b.deep.x
        return (
          <ul>
            {items().sort(cmp).map(t => (
              <li key={t.name}>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain("'cmp'")
    expect(bf021[0].message).toContain('not a supported shape')
  })

  test('@client suppresses BF021 for an unresolved sort comparator identifier', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { cmp } from './cmp'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {/* @client */ items().sort(cmp).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(0)
  })

  test('emits BF021 for localeCompare with a locale/options argument', () => {
    // The zero-arg `a.f.localeCompare(b.f)` form lowers, but the
    // locale/options form needs per-adapter collation plumbing and
    // stays refused (deferred #1448 Tier B follow-up).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain('not a supported shape')
  })

  test('no BF021 for let-inline block-body sort comparator (#2040)', () => {
    // #2040: a value-producing block body (pure `const` bindings + a terminal
    // `return`) normalises to a single expression via let-inline, so a
    // `{ const x = a.price; return x - b.price }` comparator now lowers exactly
    // like the expression-bodied `(a, b) => a.price - b.price`.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().sort((a, b) => { const x = a.price; return x - b.price }).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(0)
  })

  test('emits BF021 error for imperative block-body sort comparator (#2040)', () => {
    // An imperative comparator (local re-assignment / mutation) has no
    // value-position lowering — `foldBlockToExpr` refuses it, so the arrow stays
    // `unsupported` and the sort extraction surfaces BF021.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().sort((a, b) => { let r = 0; r = a.price - b.price; return r }).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain('not a supported shape')
  })

  test('no BF021 error for supported sort comparator', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().sort((a, b) => a.price - b.price).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)

    expect(bf021).toHaveLength(0)
  })
})

// Rest-pattern destructure in filter predicates (#1532). Mode A
// (`rest.X` member access) rewrites to `_t.X` and compiles cleanly;
// Mode B (rest as a value) surfaces BF021 with the rest binding
// name and the `@client` workaround. These tests pin the full
// pipeline: parser → IR → ctx.errors → BF021 code + message shape.
describe('Rest Pattern in Filter Predicate (BF021, #1532)', () => {
  test('no BF021 for Mode A — `rest.X` member access lowers cleanly', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().filter(({ done, ...rest }) => done && rest.priority > 0).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(0)
  })

  test('emits BF021 for Mode B — rest passed to call (`Object.keys(rest)`)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().filter(({ done, ...rest }) => Object.keys(rest).length > 0).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(1)
    // Reason carries the rest binding name + the `@client` workaround
    // (the suggestion is attached separately on the error).
    expect(bf021[0].message).toContain("'rest'")
    expect(bf021[0].message).toContain('@client')
    expect(bf021[0].suggestion?.message).toContain('@client')
  })

  test('emits BF021 for Mode B — `rest` as bare return value', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().filter(({ done, ...rest }) => rest).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain("'rest'")
  })

  test('emits BF021 with collision message when `rest.X` shadows a declared key', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().filter(({ done, ...rest }) => rest.done).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(1)
    // Reason carries both the rest binding and the shadowed key.
    expect(bf021[0].message).toContain("'rest.done'")
    expect(bf021[0].message).toContain("'done'")
  })

  test('@client suppresses BF021 for Mode B rest usage', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {/* @client */ items().filter(({ done, ...rest }) => Object.keys(rest).length > 0).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(0)
  })

  // Block body + destructured param (#1532 review). Neither
  // `parseBlockBody` (block-body lowering) nor `parseExpression`
  // (expression-body destructure rewrite) cover this shape, so
  // without an explicit refusal the chain would slip through to a
  // later adapter-level BF101. Surface BF021 at the IR layer with
  // the `@client` workaround.
  test('emits BF021 for block-body arrow with destructured param', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().filter(({ done, ...rest }) => { return done }).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain('Block body')
    expect(bf021[0].message).toContain('@client')
  })

  // Method-call refusal end-to-end (#1532 review). Parser-level
  // tests pin `rest.foo()` → `call`, but the IR-layer wiring needs
  // its own coverage to confirm the reason string propagates from
  // `validateRestUsage` through `extractFilterPredicate` to the
  // BF021 diagnostic with the dedicated `'this' receiver` wording.
  test('emits BF021 for method call on rest binding', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().filter(({ a, ...rest }) => rest.foo()).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain("Method call 'rest.foo()'")
    expect(bf021[0].message).toContain("'this' receiver")
    expect(bf021[0].message).toContain('@client')
  })

  // Computed rest access end-to-end (#1532 review). `rest[0]` is
  // refused at parser as a value-use; pin BF021 fires at the IR
  // layer with the rest-binding name.
  test('emits BF021 for computed rest access', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().filter(({ a, ...rest }) => rest[0]).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain("'rest'")
  })

  // Renamed-key collision end-to-end (#1532 review). The parser-level
  // test pins `{done: d, ...rest}` → `call`; pin the IR-layer BF021
  // surface and the source-key wording (the message phrases the
  // diagnostic in terms of the SOURCE key 'done', not the local
  // rename 'd').
  test('emits BF021 for renamed-key collision (rest.done after {done: d})', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().filter(({ done: d, ...rest }) => rest.done).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain("'rest.done'")
    expect(bf021[0].message).toContain('source key')
  })

  // Nested-pattern outer-key collision end-to-end (#1532 review).
  // The outer `user` key is consumed by the nested pattern; the
  // collision message must still fire even though there's no local
  // binding for `user` in user code.
  test('emits BF021 for nested-pattern outer-key collision (rest.user after {user: {name}})', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {items().filter(({ user: { name }, ...rest }) => rest.user).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(1)
    expect(bf021[0].message).toContain("'rest.user'")
  })

  // `@client` suppresses the collision and method-call refusal
  // categories too — not just the bare value-use Mode B (#1532
  // review). Pin one case per refusal kind so a future tweak to
  // the `isClientOnly` gate can't silently start emitting BF021
  // for one path while suppressing another.
  test('@client suppresses BF021 for collision', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {/* @client */ items().filter(({ done, ...rest }) => rest.done).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(0)
  })

  test('@client suppresses BF021 for method call on rest', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        return (
          <ul>
            {/* @client */ items().filter(({ a, ...rest }) => rest.foo()).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `

    const { errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    expect(bf021).toHaveLength(0)
  })
})

// Block-bodied filter predicates are normalized to a single boolean expression
// (#2040). A value-producing block lowers like an expression predicate; an
// imperative block refuses.
describe('Block-body filter predicate normalization (#2040)', () => {
  function loopFilterIR(predicate: string) {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function TodoList() {
        const [items, setItems] = createSignal<any[]>([])
        const [filter, setFilter] = createSignal('all')
        return (
          <ul>
            {items().filter(${predicate}).map(t => (
              <li>{t.name}</li>
            ))}
          </ul>
        )
      }
    `
    const { ir, errors } = compileToIR(source)
    const bf021 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_JSX_PATTERN)
    // Find the loop node carrying the filterPredicate.
    let found: any = null
    const walk = (n: any) => {
      if (!n || found) return
      if (n.filterPredicate) found = n
      for (const c of n.children ?? []) walk(c)
    }
    walk(ir)
    return { bf021, filterPredicate: found?.filterPredicate }
  }

  test('value-producing block (let-inline + early return) folds to a predicate', () => {
    const { bf021, filterPredicate } = loopFilterIR(`t => {
      const f = filter()
      if (f === 'active') return !t.done
      if (f === 'completed') return t.done
      return true
    }`)
    expect(bf021).toHaveLength(0)
    // No leftover block shape — a single boolean predicate expression.
    expect(filterPredicate?.predicate).toBeDefined()
    expect((filterPredicate as any)?.blockBody).toBeUndefined()
  })

  test('signal read on multiple branches still folds (idempotent getter is pure)', () => {
    const { bf021, filterPredicate } = loopFilterIR(`t => {
      const f = filter()
      if (f === 'active') return !t.done
      return f === 'completed' ? t.done : true
    }`)
    expect(bf021).toHaveLength(0)
    expect(filterPredicate?.predicate).toBeDefined()
  })

  test('imperative block (local re-assignment) refuses with BF021', () => {
    const { bf021 } = loopFilterIR(`t => {
      let keep = false
      keep = !t.done
      return keep
    }`)
    expect(bf021.length).toBeGreaterThan(0)
  })
})
