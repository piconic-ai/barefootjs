/**
 * #3239: a reactive `.map()` row's plain (non-destructured) callback param
 * gets accessor-wrapped (`choice` → `choice()`) via a naive
 * `\bchoice\b`-style regex in `wrapLoopParamAsAccessor` (and its
 * `wrapIndexParamAsAccessor` twin). That regex also matches tokens that
 * merely SPELL the param name without referencing it:
 *
 *   - an object-literal key (`{ choice: 1 }`)
 *   - a shorthand property (`{ choice }`)
 *   - a member/property name (`obj.choice`)
 *
 * Depending on position the result is either invalid JS (key/shorthand —
 * esbuild's `Expected "{" but found "}"`, a hard build failure) or
 * valid-but-wrong JS (member access — `obj.choice()` throws `TypeError` at
 * row-creation time). This is the plain-parameter sibling of #1244 (which
 * fixed the equivalent shorthand corruption for *destructured* loop params
 * via `expandShorthandBindings`) and #2856.
 *
 * These tests compile through `compileJSX` — the exact function
 * `packages/vite/src/plugin.ts` calls to produce a component's client JS —
 * with a REACTIVE array (`createSignal`), which is required to reach the
 * `mapArrayLazy`/`createRow`/`applyItem` code path this bug lives in (a
 * plain non-reactive array takes the static `forEach` hydration path and
 * never goes through `wrapLoopParamAsAccessor` at all).
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getClientJs(source: string, filename = 'App.tsx'): string {
  const result = compileJSX(source, filename, { adapter })
  const hardErrors = result.errors.filter(e => e.severity === 'error')
  expect(hardErrors).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

/**
 * Every emitted row-construction function (`createRow`, `applyItem`,
 * `applyOuter`, …) must be syntactically valid JS. `ts.transpileModule`'s
 * `reportDiagnostics` runs the host's real JS/TS parser over the whole
 * compiled module as-is — the same class of check esbuild's transform
 * performs during a real `vite build` — so a corrupted key/shorthand
 * position (invalid JS) surfaces as a syntactic diagnostic here exactly as
 * it did in the reported esbuild failure, without needing esbuild itself as
 * a test dependency, and without the module-level `import`/`export`
 * statements needing to be stripped out first (CLAUDE.md forbids
 * regex/string-based handling of compiled client JS — see `combine-client-js.ts`'s
 * AST-walk precedent).
 */
function syntaxErrorsOf(clientJs: string): readonly ts.Diagnostic[] {
  const result = ts.transpileModule(clientJs, {
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.Latest },
  })
  return (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error)
}

function assertParses(clientJs: string): void {
  expect(syntaxErrorsOf(clientJs)).toHaveLength(0)
}

/**
 * The counterpart to `assertParses`: a nested declaration that shadows the
 * loop param (see the `rewriteIdentifierAsAccessor` docstring in
 * `ir-to-client-js/utils.ts`) is expected to fail loudly at this
 * parse-check rather than silently emit a value that's wrong at runtime.
 */
function assertDoesNotParse(clientJs: string): void {
  expect(syntaxErrorsOf(clientJs).length).toBeGreaterThan(0)
}

describe('.map() row: object-literal key / shorthand / member positions vs. the loop param (#3239)', () => {
  test('shorthand property `{ choice }` expands to `{ choice: choice() }`, not `{ choice() }`', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function f(o: { key: string; choice: string }): string {
        return o.key + ':' + o.choice
      }
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{f({ key: 'x', choice })}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain("f({ key: 'x', choice: choice() })")
    // The corrupted shape would have been the bare identifier used as a
    // key with no value at all: `f({ key: 'x', choice() })`.
    expect(js).not.toContain("f({ key: 'x', choice() })")
  })

  test('explicit non-shorthand key `{ choice: 1 }` is left untouched (the key is not a reference)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{JSON.stringify({ choice: 1 })}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('JSON.stringify({ choice: 1 })')
    expect(js).not.toContain('choice(): 1')
  })

  test('explicit key with matching value `{ choice: choice }` rewrites only the value', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function f(o: { key: string; choice: string }): string {
        return o.key + ':' + o.choice
      }
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{f({ key: 'x', choice: choice })}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain("f({ key: 'x', choice: choice() })")
    expect(js).not.toContain('choice():')
  })

  test('member access `CONST.choice` leaves the member name alone (not `CONST.choice()`)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const CONST = { choice: 'z' }
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{CONST.choice}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('CONST.choice')
    expect(js).not.toContain('CONST.choice()')
  })

  test('renamed key `{ a: choice }` (no name collision) keeps working — regression guard', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function f(o: { a: string }): string { return o.a }
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{f({ a: choice })}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('f({ a: choice() })')
  })

  test('plain reference and member access ON the item itself still wrap correctly — regression guard', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function App() {
        const [items] = createSignal(['aa', 'bb'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{choice.length}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('choice().length')
  })

  test('index param (#2859): object key `{ i: 1 }` and member access `obj.i` are left alone on the EAGER (non-lazy) path', () => {
    // A child component inside the row forces the row out of the lazy-row
    // graph (`hasChildComponent`, `lazy-row-eligibility.ts`) and onto the
    // `mapArray` eager path — the only path that runs
    // `wrapIndexParamAsAccessor` at all (`build-plain-row.ts`: the lazy
    // path hands `applyItem`/`createRow` a plain `__e.index` instead, see
    // `loop-index-reactivity.test.ts`).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const obj = { i: 5 }
      function Child({ x }: { x: number }) { return <span>{x}</span> }
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <ul>
            {items().map((choice, i) => (
              <li key={choice}>
                <Child x={i} />
                {JSON.stringify({ i: 1 })}{obj.i}{i}
              </li>
            ))}
          </ul>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('JSON.stringify({ i: 1 })')
    expect(js).toContain('obj.i')
    expect(js).not.toContain('obj.i()')
    expect(js).not.toContain('i(): 1')
    // The genuine index references (passed to the child, and read directly
    // in the row's own text) are still wrapped as accessor calls.
    expect(js).toContain('return i()')
    expect(js).toContain('String(i())')
  })
})

describe('.map() row: declaration/member positions the old regex skipped via its "followed by (" lookahead', () => {
  test('object-literal method `{ choice() {...} }` is left alone (not `{ choice()() {...} }`)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{JSON.stringify({ choice() { return 1 } })}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('choice() { return 1 }')
    expect(js).not.toContain('choice()()')
  })

  test('accessor method `{ get choice() {...} }` is left alone (not `{ get choice()() {...} }`)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{JSON.stringify({ get choice() { return 1 } })}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('get choice() { return 1 }')
    expect(js).not.toContain('choice()()')
  })

  test('nested `function choice() {...}` declaration is left alone (not `function choice()() {...}`)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{(function choice() { return 1 })()}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('function choice() { return 1 }')
    expect(js).not.toContain('choice()()')
  })

  test('`new choice()` is left alone (not `new choice()()`)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{String(new choice())}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('new choice()')
    expect(js).not.toContain('new choice()()')
  })

  test('a self-reference inside a named `function choice() {...}` expression refers to itself, not the outer item', () => {
    // Unlike a `function`/`class` DECLARATION (whose name reaches into the
    // surrounding scope), a named function EXPRESSION's name is scoped to
    // exactly its own body — so `choice.length` inside this one can only
    // mean the inner function, never the outer loop item, and must be left
    // completely untouched rather than wrapped into `choice().length`.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function App() {
        const [items] = createSignal(['aa', 'bb'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{(function choice() { return choice.length })()}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('function choice() { return choice.length }')
    expect(js).not.toContain('choice().length')
  })
})

describe('.map() row: a nested scope that shadows the loop param fails loudly instead of silently misrewriting', () => {
  // `rewriteIdentifierAsAccessor` has no scope tracking (see its docstring
  // in ir-to-client-js/utils.ts): once a nested scope re-binds the loop
  // param's name, the rewrite can no longer tell a reference to the outer
  // item from a reference to the shadowing local, so it deliberately wraps
  // the shadowing declaration's own name too. That's always a syntax break
  // at the declaration site, so the module fails a syntax check instead of
  // silently compiling into a runtime `TypeError` against the wrong value
  // — matching what the pre-#3239 regex already did for this shape (it had
  // no shadow-awareness either).

  test('a nested `.map(choice => ...)` that reuses the outer loop param name fails to parse', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function App() {
        const [items] = createSignal(['ab', 'cd'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{choice.split('').map(choice => choice.toUpperCase()).join('')}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertDoesNotParse(js)
  })

  test('a nested `const choice = ...` that reuses the outer loop param name fails to parse', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{(() => { const choice = 1; return choice })()}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertDoesNotParse(js)
  })
})

describe('destructured loop-param path (rewriteLoopBindingRefs) shares the plain-param AST rewrite (#3260)', () => {
  // `rewriteLoopBindingRefs` rewrites a DESTRUCTURED loop param's bindings
  // (`({ color, label }) => ...`) to `__bfItem().color` etc. It used a
  // \bname\b-style regex plus a shorthand-only AST pre-pass (#1244), so an
  // explicit object-literal key or a member name spelling a binding name was
  // corrupted the same way #3239 described for the plain param. It now runs
  // the same AST walk as `rewriteIdentifierAsAccessor`.
  function compileRow(row: string, item = "{ color: 'red', label: 'a', onPick: () => 1, extra: 1 }", pattern = '{ color, label }'): string {
    return getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      const THEME = { color: 'blue' }
      export function App() {
        const [items] = createSignal([${item}])
        return (
          <div>
            {items().map((${pattern}) => (
              ${row}
            ))}
          </div>
        )
      }
    `)
  }

  test('an object-literal key matching a destructured binding name is left alone', () => {
    const js = compileRow('<b key={label}>{JSON.stringify({ color: 1 })}</b>')
    assertParses(js)
    expect(js).toContain('JSON.stringify({ color: 1 })')
  })

  test('a member name matching a destructured binding name is left alone', () => {
    const js = compileRow('<b key={label}>{THEME.color}</b>')
    assertParses(js)
    expect(js).toContain('THEME.color')
    expect(js).not.toContain('THEME.__bfItem()')
  })

  test('explicit key with a matching value `{ color: color }` rewrites only the value', () => {
    const js = compileRow('<b key={label}>{JSON.stringify({ color: color })}</b>')
    assertParses(js)
    expect(js).toContain('JSON.stringify({ color: __bfItem().color })')
  })

  test('shorthand `{ color }` still expands to `{ color: __bfItem().color }` (#1244)', () => {
    const js = compileRow('<b key={label}>{JSON.stringify({ color })}</b>')
    assertParses(js)
    expect(js).toContain('JSON.stringify({ color: __bfItem().color })')
  })

  test('a destructured binding called as a function becomes a call on the item field', () => {
    // Unlike the plain param, `onPick()` is not an accessor call already —
    // it calls the item's `onPick` field — so the callee is rewritten.
    const js = compileRow('<b key={label}>{String(onPick())}</b>', undefined, '{ label, onPick }')
    assertParses(js)
    expect(js).toContain('String(__bfItem().onPick())')
  })

  test('a rest binding still renders through its residual form', () => {
    const js = compileRow('<b key={label}>{JSON.stringify(rest)}</b>', undefined, '{ label, ...rest }')
    assertParses(js)
    expect(js).toContain('JSON.stringify((({ label: __bfR0, ...__bfRest }) => __bfRest)(__bfItem()))')
  })

  test('a named function expression shadows only its own name; other bindings inside are still rewritten', () => {
    const js = compileRow('<b key={label}>{String((function color() { return label })())}</b>')
    assertParses(js)
    expect(js).toContain('(function color() { return __bfItem().label })()')
  })

  test('a nested function declaration shadowing a binding fails to parse instead of calling the item field', () => {
    // Keeping `function color() {}` while rewriting its call to
    // `__bfItem().color()` would compile and then call the wrong value at
    // hydration. Rewriting the declaration name too breaks it loudly, as the
    // old destructured regex did (#3260 review).
    const js = compileRow("<b key={label}>{(() => { function color() { return 'blue' } return color() })()}</b>")
    assertDoesNotParse(js)
  })
})
