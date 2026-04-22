import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('conditional JSX returns (if-statement)', () => {
  test('collects event handlers from both branches of conditional return', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Toggle(props: { asChild?: boolean }) {
        const [open, setOpen] = createSignal(false)

        if (props.asChild) {
          return <span onClick={() => setOpen(!open())}>child</span>
        }

        return <button onClick={() => setOpen(!open())}>toggle</button>
      }
    `

    const result = compileJSXSync(source, 'Toggle.tsx', { adapter })

    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs?.content).toContain('initToggle')
    // Both branches should have click handlers collected
    expect(clientJs?.content).toContain("addEventListener('click'")
  })

  test('collects reactive attributes from conditional return branches', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Disclosure(props: { asChild?: boolean }) {
        const [open, setOpen] = createSignal(false)

        if (props.asChild) {
          return <div aria-expanded={open()} onClick={() => setOpen(!open())}>child</div>
        }

        return <button aria-expanded={open()} onClick={() => setOpen(!open())}>toggle</button>
      }
    `

    const result = compileJSXSync(source, 'Disclosure.tsx', { adapter })

    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Reactive attribute should generate createEffect for aria-expanded
    expect(clientJs?.content).toContain('createEffect')
    expect(clientJs?.content).toContain('aria-expanded')
  })

  test('collects child component inits from conditional return branches', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Wrapper(props: { variant?: string }) {
        const [active, setActive] = createSignal(false)

        if (props.variant === 'fancy') {
          return <div><Child onToggle={() => setActive(!active())} /></div>
        }

        return <div><Child onToggle={() => setActive(!active())} /></div>
      }
    `

    const result = compileJSXSync(source, 'Wrapper.tsx', { adapter })

    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Child component initialization should be collected
    expect(clientJs?.content).toContain('initChild')
  })
})

describe('top-level ternary return (#968)', () => {
  // Regression test for #968: previously, a component whose top-level return
  // was a ternary expression dropped the conditional entirely — the SSR
  // template always rendered the truthy branch, and the client reconciler
  // never swapped branches.
  test('preserves conditional when top-level return is `cond ? <A/> : null`', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function BadgeDemo() {
        const [count, setCount] = createSignal(0)
        return count() > 0 ? <span>{count()}</span> : null
      }
    `

    const result = compileJSXSync(source, 'BadgeDemo.tsx', { adapter })

    expect(result.errors).toHaveLength(0)

    const marked = result.files.find(f => f.type === 'markedTemplate')
    expect(marked).toBeDefined()
    // Conditional must survive to the SSR template — both ternary operator
    // and the cond-start/end comment markers for the falsy branch.
    expect(marked?.content).toContain('count() > 0 ?')
    // Synthetic scope wrapper so findScope() has a bf-s anchor for the
    // comment-only (falsy) branch.
    expect(marked?.content).toContain('display:contents')
    expect(marked?.content).toContain('bf-s={__scopeId}')

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Client reconciler must call insert() so the truthy branch appears
    // only when count() > 0.
    expect(clientJs?.content).toContain("insert(__scope, 's0', () => count() > 0")
    expect(clientJs?.content).toContain('bf-cond-start:s0')
    expect(clientJs?.content).toContain('bf-cond-end:s0')
  })

  test('preserves conditional when both branches are JSX', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Toggle() {
        const [on, setOn] = createSignal(false)
        return on() ? <span>ON</span> : <span>OFF</span>
      }
    `

    const result = compileJSXSync(source, 'Toggle.tsx', { adapter })

    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs?.content).toContain('insert(__scope')
    expect(clientJs?.content).toContain('<span bf-c="s0">ON</span>')
    expect(clientJs?.content).toContain('<span bf-c="s0">OFF</span>')
  })

  test('handles parenthesized top-level ternary', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Paren() {
        const [on, setOn] = createSignal(false)
        return (on() ? <span>A</span> : <span>B</span>)
      }
    `

    const result = compileJSXSync(source, 'Paren.tsx', { adapter })

    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs?.content).toContain("insert(__scope, 's0', () => on()")
  })
})

describe('return-position dispatcher unification (#971)', () => {
  // The #968 ConditionalExpression special-case and the #971 PR 5 refactor
  // converge on the same behaviour: the analyzer captures the whole return
  // expression (any `ts.Expression`) and the Phase 1 dispatcher core decides
  // how to lower it. These tests verify that the refactor eliminates the
  // last silent-drop classes — top-level `&&`, `||`, `??` with JSX, and
  // `.map` returning JSX — all of which previously tripped the
  // recursion-as-discriminator fallback in `visitComponentBody`.

  test('top-level `return cond && <span/>` renders a conditional, not the JSX unconditionally', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Guard() {
        const [show, setShow] = createSignal(false)
        return show() && <span>Shown</span>
      }
    `

    const result = compileJSXSync(source, 'Guard.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const marked = result.files.find(f => f.type === 'markedTemplate')
    // Synthetic scope wrapper provides the bf-s anchor; the conditional
    // itself is emitted in the template as `{cond ? <A/> : null}` —
    // transformLogicalAnd lowers `&&` into an IRConditional with whenFalse=null.
    // If the analyzer were still silently picking the JSX on the right,
    // the template would contain a bare `<span>Shown</span>` root with no
    // ternary — that was the pre-refactor #968-class failure mode.
    expect(marked?.content).toContain('display:contents')
    expect(marked?.content).toContain('show() ?')
    expect(marked?.content).toContain('<span>Shown</span>')

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs?.content).toContain("insert(__scope, 's0', () => show()")
  })

  test('top-level `return prop ?? <Default/>` renders the JSX through a conditional', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Banner(props: { label?: string }) {
        const [count, setCount] = createSignal(0)
        return props.label ?? <span>Default</span>
      }
    `

    const result = compileJSXSync(source, 'Banner.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const marked = result.files.find(f => f.type === 'markedTemplate')
    expect(marked?.content).toContain('display:contents')
    // ?? desugars to `left != null`; the conditional reconciler must see
    // the left operand's value — not silently render the fallback.
    expect(marked?.content).toContain('!= null')
  })

  test('top-level `return items().map(n => <li/>)` compiles to a loop instead of failing', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function List() {
        const [items, setItems] = createSignal<string[]>(['a'])
        return items().map(n => <li key={n}>{n}</li>)
      }
    `

    const result = compileJSXSync(source, 'List.tsx', { adapter })
    // Pre-refactor this threw "No marked template in compile output" because
    // the analyzer's recursion-fallback explicitly skips function bodies, so
    // `jsxReturn` never saw the `<li/>` inside the map callback. The
    // dispatcher unification handles it the same way `.map` is handled in
    // JSX-child position (#783).
    expect(result.errors).toHaveLength(0)

    const marked = result.files.find(f => f.type === 'markedTemplate')
    expect(marked).toBeDefined()
    expect(marked?.content).toContain('display:contents')
    // The `.map` call survives to the template inside the synthetic wrapper —
    // if the analyzer were still silently walking into the callback and
    // picking up the `<li/>`, the template would contain a bare `<li/>`
    // root with no map. Same IRLoop emission path as `map-basic` at
    // JSX-child position (#783).
    expect(marked?.content).toContain('items().map')
    expect(marked?.content).toContain('<li key=')
  })
})
