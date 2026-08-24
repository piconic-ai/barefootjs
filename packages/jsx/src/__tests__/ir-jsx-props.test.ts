/**
 * BarefootJS Compiler - JSX Props Tests (#559)
 *
 * When a "use client" component passes JSX elements as named props
 * to a stateless component, the compiler should transform them into
 * IR nodes (jsxChildren) instead of raw JSX text.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRComponent, IRElement } from '../types'

const adapter = new TestAdapter()

/** Helper: find first component node in IR tree */
function findComponent(node: any, name?: string): IRComponent | undefined {
  if (node.type === 'component' && (!name || node.name === name)) return node
  const children = node.children || []
  for (const child of children) {
    const found = findComponent(child, name)
    if (found) return found
  }
  return undefined
}

describe('JSX props (#559)', () => {
  describe('Phase 1: JSX → IR', () => {
    test('JSX element prop produces jsx-children AttrValue', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return (
            <Layout controls={<input type="text" />} />
          )
        }
      `
      const ctx = analyzeComponent(source, 'App.tsx')
      const ir = jsxToIR(ctx)
      expect(ir).not.toBeNull()

      const layout = findComponent(ir!, 'Layout')
      expect(layout).toBeDefined()

      const controlsProp = layout!.props.find(p => p.name === 'controls')
      expect(controlsProp).toBeDefined()
      expect(controlsProp!.value.kind).toBe('jsx-children')
      const v = controlsProp!.value as Extract<typeof controlsProp.value, { kind: 'jsx-children' }>
      expect(v.children).toHaveLength(1)
      expect(v.children[0].type).toBe('element')
      expect((v.children[0] as IRElement).tag).toBe('input')
    })

    test('parenthesized JSX prop produces jsx-children AttrValue', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return (
            <Layout controls={(<div><span>hello</span></div>)} />
          )
        }
      `
      const ctx = analyzeComponent(source, 'App.tsx')
      const ir = jsxToIR(ctx)

      const layout = findComponent(ir!, 'Layout')
      const controlsProp = layout!.props.find(p => p.name === 'controls')
      expect(controlsProp!.value.kind).toBe('jsx-children')
      const v = controlsProp!.value as Extract<typeof controlsProp.value, { kind: 'jsx-children' }>
      expect(v.children).toHaveLength(1)
      expect(v.children[0].type).toBe('element')
      expect((v.children[0] as IRElement).tag).toBe('div')
    })

    test('elements inside JSX props get ^-prefixed slot IDs', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return (
            <Layout controls={
              <button onClick={() => setVal('clicked')}>Click</button>
            } />
          )
        }
      `
      const ctx = analyzeComponent(source, 'App.tsx')
      const ir = jsxToIR(ctx)

      const layout = findComponent(ir!, 'Layout')
      const controlsProp = layout!.props.find(p => p.name === 'controls')
      const v = controlsProp!.value as Extract<typeof controlsProp.value, { kind: 'jsx-children' }>
      const button = v.children[0] as IRElement
      expect(button.tag).toBe('button')
      // Elements in JSX props are parent-owned, so get ^ prefix
      expect(button.slotId).toMatch(/^\^s\d+$/)
      expect(button.events).toHaveLength(1)
      expect(button.events[0].name).toBe('click')
    })

    test('mixed JSX and non-JSX props on same component', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return (
            <Layout
              title="Hello"
              controls={<input type="text" />}
              count={42}
            />
          )
        }
      `
      const ctx = analyzeComponent(source, 'App.tsx')
      const ir = jsxToIR(ctx)

      const layout = findComponent(ir!, 'Layout')
      expect(layout!.props).toHaveLength(3)

      const titleProp = layout!.props.find(p => p.name === 'title')
      expect(titleProp!.value).toEqual({ kind: 'literal', value: 'Hello' })

      const controlsProp = layout!.props.find(p => p.name === 'controls')
      expect(controlsProp!.value.kind).toBe('jsx-children')

      const countProp = layout!.props.find(p => p.name === 'count')
      expect(countProp!.value.kind).toBe('expression')
      expect((countProp!.value as Extract<typeof countProp.value, { kind: 'expression' }>).expr).toBe('42')
    })
  })

  describe('Phase 2: Client JS generation', () => {
    test('events inside JSX props are collected in parent client JS', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return (
            <Layout controls={
              <button onClick={() => setVal('clicked')}>Click</button>
            }>
              <p>Content</p>
            </Layout>
          )
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // The client JS should contain event binding for the button
      expect(clientJs!.content).toContain('addEventListener')
      expect(clientJs!.content).toContain('click')
    })

    test('reactive expressions inside JSX props generate proper effects', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [count, setCount] = createSignal(0)
          return (
            <Layout
              controls={<span>{count()}</span>}
            />
          )
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Should have createEffect for reactive text inside JSX prop
      expect(clientJs!.content).toContain('createEffect')
    })

    test('does not generate setAttribute for JSX prop values', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return (
            <Layout controls={<input type="text" />} />
          )
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      // Should NOT have setAttribute for the JSX prop —
      // JSX props are passed via createComponent, not setAttribute
      if (clientJs) {
        expect(clientJs.content).not.toContain('setAttribute')
      }
    })

    test('component references in JSX props are imported in client JS', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return (
            <Layout controls={<Button label="ok" />} />
          )
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('@bf-child:Button')
    })

    test('client JS does not contain raw JSX syntax', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return (
            <Layout
              controls={<select onChange={(e) => setVal(e.target.value)}>
                <option value="a">A</option>
                <option value="b">B</option>
              </select>}
            />
          )
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // Raw JSX with event handlers should NOT appear — handlers are extracted
      // HTML element tags DO appear in template literals (valid JS), which is correct
      expect(clientJs!.content).not.toMatch(/onChange=\{/)
      // Event handler should be extracted into addEventListener
      expect(clientJs!.content).toContain('addEventListener')
      expect(clientJs!.content).toContain('change')
    })
  })

  describe('__slot() wrapping for component-containing JSX props', () => {
    test('__slot() wraps JSX prop when it contains components', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return <Layout controls={<Button label="ok" />} />
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('__slot(')
    })

    test('__slot() does NOT wrap when no components (HTML-only)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return <Layout controls={<input type="text" />} />
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).not.toContain('__slot(')
    })

    test('__slot() wraps nested component inside element', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return <Layout controls={<div><Button /></div>} />
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('__slot(')
    })

    test('__slot import is included when used', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function App() {
          const [val, setVal] = createSignal('')
          return <Layout controls={<Button label="ok" />} />
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      expect(clientJs!.content).toContain('__slot')
      // Import should appear
      expect(clientJs!.content).toMatch(/__slot/)
    })
  })

  describe('__isSlot guard in callee text effects', () => {
    test('__isSlot guard appears in generated text effects for reactive props', () => {
      // Callee component: renders props.controls as text
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'

        export function Layout(props: { controls: any }) {
          const [x, setX] = createSignal(0)
          return <div>{props.controls}</div>
        }
      `
      const result = compileJSX(source, 'Layout.tsx', { adapter })
      expect(result.errors).toHaveLength(0)

      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs).toBeDefined()
      // The text update routes through a claimed 'markup' slot writer (slot
      // unification A3), whose `writeMarkup` preserves the server-rendered
      // DOM for `__isSlot` values (and splices live Nodes by identity)
      // instead of the old inline `nodeValue = String(...)` assignment —
      // the same contract `__bfText` used to provide (#1663).
      expect(clientJs!.content).toContain("kind: 'markup'")
    })
  })

  // #2703 (Copilot review on #2667's PR): the naked ternary/array wrapper
  // refusal, and the direct-JSX classification it sits beside, both used
  // to unwrap only `ParenthesizedExpression` — a JSX-wrapping ternary/
  // array (or a direct JSX element) additionally wrapped in a transparent
  // TS annotation (`as`, `satisfies`, postfix non-null `!`) slipped past
  // both checks and still spliced raw JSX into the emitted client JS.
  describe('#2667/#2703: transparent TS wrappers around JSX in prop position', () => {
    test('ternary wrapping `as`-cast JSX branches still refuses with BF021', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function App() {
          const [cond, setCond] = createSignal(true)
          return (
            <Layout header={cond() ? (<a>x</a> as any) : (<b>y</b> as any)} />
          )
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      const errors = result.errors.filter(e => e.severity === 'error')
      expect(errors).toHaveLength(1)
      expect(errors[0].code).toBe('BF021')
      // No raw JSX syntax leaked into the client bundle.
      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs?.content ?? '').not.toMatch(/<a>x<\/a>|<b>y<\/b>/)
    })

    test('ternary wrapping `satisfies`-annotated JSX branches still refuses with BF021', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function App() {
          const [cond, setCond] = createSignal(true)
          return (
            <Layout header={cond() ? (<a>x</a> satisfies any) : (<b>y</b> satisfies any)} />
          )
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      const errors = result.errors.filter(e => e.severity === 'error')
      expect(errors).toHaveLength(1)
      expect(errors[0].code).toBe('BF021')
    })

    test('ternary wrapping non-null-asserted JSX branches still refuses with BF021', () => {
      // `!` must trail the CLOSING paren, not sit inside it: TS's parser
      // mis-parses `(<a/>!)` (non-null touching the JSX closing tag
      // directly, inside the parens) — confirmed by direct AST dump
      // during #2703's investigation, unrelated to this fix.
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function App() {
          const [cond, setCond] = createSignal(true)
          return (
            <Layout header={cond() ? (<a>x</a>)! : (<b>y</b>)!} />
          )
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      const errors = result.errors.filter(e => e.severity === 'error')
      expect(errors).toHaveLength(1)
      expect(errors[0].code).toBe('BF021')
    })

    test('array literal wrapping `as`-cast JSX elements still refuses with BF021', () => {
      const source = `
        export function App() {
          return (
            <Layout header={[<a>x</a> as any, <b>y</b> as any]} />
          )
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      const errors = result.errors.filter(e => e.severity === 'error')
      expect(errors).toHaveLength(1)
      expect(errors[0].code).toBe('BF021')
    })

    test('a bare `as`-cast JSX element (no ternary) still classifies as jsx-children, not a refusal', () => {
      const source = `
        export function App() {
          return <Layout header={<a>x</a> as any} />
        }
      `
      const ctx = analyzeComponent(source, 'App.tsx')
      const ir = jsxToIR(ctx)
      expect(ir).not.toBeNull()
      const layout = findComponent(ir!, 'Layout')
      const headerProp = layout!.props.find(p => p.name === 'header')
      expect(headerProp!.value.kind).toBe('jsx-children')

      // Phase 2: the compiled client JS brands it (#2651), matching the
      // bare `<a>x</a>` form byte-for-byte — `as any` is erased, not
      // spliced as source text.
      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
      const clientJs = result.files.find(f => f.type === 'clientJs')
      expect(clientJs!.content).toMatch(/bfMarkup\(`<a>x<\/a>`\)/)
    })

    test('a bare `satisfies`-annotated JSX element (no ternary) still classifies as jsx-children', () => {
      const source = `
        export function App() {
          return <Layout header={<a>x</a> satisfies any} />
        }
      `
      const ctx = analyzeComponent(source, 'App.tsx')
      const ir = jsxToIR(ctx)
      const layout = findComponent(ir!, 'Layout')
      const headerProp = layout!.props.find(p => p.name === 'header')
      expect(headerProp!.value.kind).toBe('jsx-children')
    })

    test('a bare non-null-asserted JSX element (no ternary) still classifies as jsx-children', () => {
      // `!` must trail the closing paren (`(<a/>)!`), not touch the JSX
      // closing tag directly (`<a/>!`) — the latter does not reliably
      // parse as a NonNullExpression at all inside a JSX attribute
      // expression (confirmed by direct AST dump during #2703's
      // investigation: the bare form leaves stray tokens outside the
      // JsxExpression entirely, so it never reaches this code path as a
      // NonNullExpression in the first place — unrelated to this fix).
      const source = `
        export function App() {
          return <Layout header={(<a>x</a>)!} />
        }
      `
      const ctx = analyzeComponent(source, 'App.tsx')
      const ir = jsxToIR(ctx)
      const layout = findComponent(ir!, 'Layout')
      const headerProp = layout!.props.find(p => p.name === 'header')
      expect(headerProp!.value.kind).toBe('jsx-children')
    })

    test('a ternary with NO JSX inside, wrapped in `as`, is unaffected (ordinary expression, no refusal)', () => {
      const source = `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function App() {
          const [cond, setCond] = createSignal(true)
          return <Layout disabled={(cond() ? true : false) as any} />
        }
      `
      const result = compileJSX(source, 'App.tsx', { adapter })
      expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    })
  })
})
