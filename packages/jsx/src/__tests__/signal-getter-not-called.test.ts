/**
 * Signal/Memo Getter Not Called Error Tests
 *
 * Tests for BF044: Emit compile error when a signal or memo getter
 * is passed without calling it (e.g., value={count} instead of value={count()}).
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

describe('Signal Getter Not Called (BF044)', () => {
  describe('positive cases — should emit BF044', () => {
    test('signal getter as attribute value', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div value={count} />
        }
      `

      const { errors } = compileToIR(source)
      const bf044 = errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toHaveLength(1)
      expect(bf044[0].severity).toBe('error')
      expect(bf044[0].message).toContain("'count'")
    })

    test('signal getter in JSX children', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div>{count}</div>
        }
      `

      const { errors } = compileToIR(source)
      const bf044 = errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toHaveLength(1)
      expect(bf044[0].message).toContain("'count'")
    })

    test('memo as attribute value', () => {
      const source = `
        'use client'
        import { createSignal, createMemo } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          const doubled = createMemo(() => count() * 2)
          return <div value={doubled} />
        }
      `

      const { errors } = compileToIR(source)
      const bf044 = errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toHaveLength(1)
      expect(bf044[0].message).toContain("'doubled'")
    })

    test('memo in JSX children', () => {
      const source = `
        'use client'
        import { createSignal, createMemo } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          const doubled = createMemo(() => count() * 2)
          return <div>{doubled}</div>
        }
      `

      const { errors } = compileToIR(source)
      const bf044 = errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toHaveLength(1)
      expect(bf044[0].message).toContain("'doubled'")
    })

    test('error suggestion includes corrected call syntax', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div value={count} />
        }
      `

      const { errors } = compileToIR(source)
      const bf044 = errors.find(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toBeDefined()
      expect(bf044!.suggestion).toBeDefined()
      expect(bf044!.suggestion!.message).toContain('count()')
      expect(bf044!.suggestion!.replacement).toBe('count()')
    })
  })

  describe('negative cases — should NOT emit BF044', () => {
    test('correct signal call: value={count()}', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div value={count()} />
        }
      `

      const { errors } = compileToIR(source)
      const bf044 = errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toHaveLength(0)
    })

    test('correct memo call: value={doubled()}', () => {
      const source = `
        'use client'
        import { createSignal, createMemo } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          const doubled = createMemo(() => count() * 2)
          return <div value={doubled()} />
        }
      `

      const { errors } = compileToIR(source)
      const bf044 = errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toHaveLength(0)
    })

    test('non-signal identifier: value={someLocal}', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          const someLocal = "hello"
          return <div value={someLocal} />
        }
      `

      const { errors } = compileToIR(source)
      const bf044 = errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toHaveLength(0)
    })

    test('props access: value={props.checked}', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter(props: { checked: boolean }) {
          const [count, setCount] = createSignal(0)
          return <div value={props.checked} />
        }
      `

      const { errors } = compileToIR(source)
      const bf044 = errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toHaveLength(0)
    })

    test('complex expression: value={count() + 1}', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div value={count() + 1} />
        }
      `

      const { errors } = compileToIR(source)
      const bf044 = errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toHaveLength(0)
    })

    test('setter passed to event handler: onChange={setCount}', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={setCount}>{count()}</button>
        }
      `

      const { errors } = compileToIR(source)
      const bf044 = errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toHaveLength(0)
    })
  })

  describe('integration', () => {
    test('IR is still produced despite BF044 error', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div value={count} />
        }
      `

      const { ir, errors } = compileToIR(source)

      const bf044 = errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)
      expect(bf044).toHaveLength(1)

      expect(ir).not.toBeNull()
      expect(ir!.type).toBe('element')
    })

    test('compileJSX includes BF044 in result errors', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div value={count} />
        }
      `

      const result = compileJSX(source, 'Counter.tsx', { adapter })
      const bf044 = result.errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

      expect(bf044).toHaveLength(1)
      expect(bf044[0].severity).toBe('error')
    })
  })

  /**
   * Nested descent (#2755 / #2751 upstream fix).
   *
   * The gate used to open with `if (!ts.isIdentifier(expr)) return`, so it saw
   * only an expression's TOP-LEVEL node. Every shape below reaches a rendered
   * position through some wrapper, and every one of them used to compile
   * silently and then miscompile downstream — the accessor stringified into a
   * DOM property (#2755) or referenced from a module-scope template thunk that
   * cannot see it (#2751).
   *
   * The negative cases are the load-bearing half: descending EVERYWHERE would
   * break the Context-Provider idiom, where handing a descendant an uncalled
   * accessor is the whole point. The rule is "rendered position", not "nested".
   */
  describe('nested descent into rendered positions', () => {
    // `Child` is declared AFTER `Counter` deliberately: `analyzeComponent`
    // analyzes the FIRST function in the module, so hoisting the child above
    // would silently analyze `Child` instead and make every case below report
    // zero diagnostics — the negative cases would then pass for the wrong
    // reason. The positive block is the control that proves the walk is
    // actually live in this exact module shape.
    const wrap = (body: string) => `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        const [items, setItems] = createSignal([1, 2])
        return ${body}
      }

      function Child(props: { value?: unknown }) { return <span /> }
    `
    const bf044Of = (body: string) =>
      compileToIR(wrap(body)).errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)

    describe('fires — the getter reaches a rendered position', () => {
      test.each([
        ['ternary condition', '<div className={count ? "on" : "off"} />'],
        ['template literal span', '<div className={`x-${count}`} />'],
        ['call argument', '<div className={String(count)} />'],
        ['array literal member', '<div className={[count].join("")} />'],
        ['style object property value', '<div style={{ color: count }} />'],
        ['JSX text child', '<div>{count ? "a" : "b"}</div>'],
      ])('%s', (_label, body) => {
        const bf044 = bf044Of(body)
        expect(bf044).toHaveLength(1)
        expect(bf044[0].message).toContain("'count'")
      })
    })

    describe('stays silent — the getter is handed onward, not rendered', () => {
      test.each([
        // The `<SelectContext.Provider value={{ open, ... }}>` shape: every
        // member is an accessor BY CONTRACT. Calling it here would freeze the
        // value at provider-render time and break every consumer.
        ['component prop, object literal member', '<Child value={{ x: count }} />'],
        ['component prop, ternary', '<Child value={count ? 1 : 2} />'],
        ['component prop, call argument', '<Child value={String(count)} />'],
      ])('%s', (_label, body) => {
        expect(bf044Of(body)).toHaveLength(0)
      })

      test('a loop-row param shadowing a same-named signal', () => {
        // `count` here is the row item, not the signal — resolved through the
        // ambient `BindingScope`, which sees bindings introduced OUTSIDE the
        // checked expression.
        expect(bf044Of('<ul>{items().map(count => <li className={count ? "a" : "b"} />)}</ul>')).toHaveLength(0)
      })

      test('correctly called getter in every nested shape', () => {
        expect(bf044Of('<div className={count() ? "on" : "off"} />')).toHaveLength(0)
        expect(bf044Of('<div style={{ color: count() }} />')).toHaveLength(0)
      })
    })

    describe('binding and parameter defaults', () => {
      // A default VALUE is an ordinary expression in the enclosing scope, but
      // the walk used to visit only binding NAMES. Measured before the fix:
      // both shapes compiled silently and emitted a module-scope `template`
      // thunk referencing a component-scope binding — `ReferenceError` on CSR
      // mount, i.e. #2751's mechanism surviving inside the very check meant to
      // close it.
      test('destructuring default in a rendered position', () => {
        expect(bf044Of('<div className={(() => { const { x = count } = ({} as { x?: unknown }); return String(x) })()} />')).toHaveLength(1)
      })

      test('parameter default in a rendered position', () => {
        expect(bf044Of('<div className={((f = count) => String(f))()} />')).toHaveLength(1)
      })

      test('a later default reading an EARLIER parameter stays silent', () => {
        // JS binds parameters left to right: `(count, x = count) => …` reads
        // the already-bound parameter, not the signal it shadows (verified
        // against V8). Visiting every default before binding any parameter
        // would flag this — a false positive on working code.
        expect(bf044Of('<div className={((count2: unknown, x = count2) => String(x))(1)} />')).toHaveLength(0)
        expect(bf044Of('<div className={((count: unknown, x = count) => String(x))(1)} />')).toHaveLength(0)
      })

      test('a later default reading an EARLIER pattern element stays silent', () => {
        // The same left-to-right rule applies WITHIN a pattern.
        expect(bf044Of('<div className={(() => { const { count: c, x = c } = ({} as { count?: unknown; x?: unknown }); return String(x) })()} />')).toHaveLength(0)
      })

      test('a literal default stays silent', () => {
        // The overwhelmingly common shape (`{ size = 'md' }`): the default is
        // not a reactive name, so widening the walk must not touch it.
        expect(bf044Of(`<div className={(({ size = 'md' }: { size?: string }) => size)({})} />`)).toHaveLength(0)
      })
    })

    test('does not misfire on a TYPE position', () => {
      // A type is not a value. `({} as { count?: unknown })` in a rendered
      // position used to read the type literal's property name as a bare
      // reference to the same-named signal and refuse valid code.
      expect(bf044Of('<div className={String(({} as { count?: unknown }).count)} />')).toHaveLength(0)
    })

    test('does not misfire on a nested element ATTRIBUTE NAME', () => {
      // The walk stops at a nested JSX boundary. Without that guard, descending
      // into a `.map()` body that returns JSX read the nested element's own
      // attribute NAME (`checked=`) as a bare reference to the same-named
      // signal — `transformNode` re-walks that element independently anyway.
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Boxes() {
          const [checked, setChecked] = createSignal(false)
          const [items, setItems] = createSignal([1, 2])
          return <ul>{items().map(n => <li><input checked={checked()} /></li>)}</ul>
        }
      `
      const bf044 = compileToIR(source).errors.filter(e => e.code === ErrorCodes.SIGNAL_GETTER_NOT_CALLED)
      expect(bf044).toHaveLength(0)
    })
  })
})
