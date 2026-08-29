/**
 * Render-root row-key relay (`IRElement.keyAttr` with no `value`) — #2753's
 * "mechanism 2".
 *
 * A component's rendered root is whatever element carries `bf-s`
 * (`needsScope`). When that component is used as a caller's keyed loop row,
 * the caller's key has to land on THAT element: `mapArray` reconciles rows
 * by reading the key attribute off the row's primary element, and the CSR
 * half of the contract (`renderChild` / `materializeComponent` in
 * `@barefootjs/client`) splices `data-key` onto the rendered markup's first
 * element regardless of what wrapper nodes sit above it. `resolveRootKeyAttr`
 * is the SSR half, and it must agree.
 *
 * The regression these tests exist for: resolving the relay by walking DOWN
 * from the IR root and stopping at the first node that is not an
 * element/fragment/if-statement. `<Ctx.Provider>` is neither, but
 * `transformProviderElement` passes `ctx.isRoot` through to its children — so
 * a provider-rooted component (select, popover, accordion, carousel,
 * combobox, command, dropdown-menu, radio-group) has a `needsScope` element
 * the walk never reaches, and every adapter silently stopped relaying its
 * caller's key.
 */
import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import type { IRElement, IRNode } from '../types'

function compile(source: string, name = 'Test'): IRNode {
  const ir = jsxToIR(analyzeComponent(source, `${name}.tsx`))
  expect(ir).not.toBeNull()
  return ir!
}

/** Every `element` node in the tree, in document order. */
function allElements(node: IRNode): IRElement[] {
  const out: IRElement[] = []
  const visit = (n: IRNode | null | undefined): void => {
    if (!n) return
    if (n.type === 'element') out.push(n)
    switch (n.type) {
      case 'element':
      case 'fragment':
      case 'component':
      case 'provider':
      case 'loop':
        for (const c of n.children) visit(c)
        return
      case 'async':
        visit(n.fallback)
        for (const c of n.children) visit(c)
        return
      case 'conditional':
        visit(n.whenTrue)
        visit(n.whenFalse)
        return
      case 'if-statement':
        visit(n.consequent)
        visit(n.alternate)
        return
    }
  }
  visit(node)
  return out
}

const PROVIDER_ROOT = `
'use client'
import { createContext, createSignal } from '@barefootjs/client'

const SelectContext = createContext({ open: false })

export function Select(props: { children?: unknown }) {
  const [open, setOpen] = createSignal(false)
  return (
    <SelectContext.Provider value={{ open: open(), setOpen }}>
      <div data-slot="select">{props.children}</div>
    </SelectContext.Provider>
  )
}
`

describe('render-root row-key relay (#2753)', () => {
  test('a provider-rooted component relays the key on the element under the provider', () => {
    const ir = compile(PROVIDER_ROOT, 'Select')

    expect(ir.type).toBe('provider')
    const div = allElements(ir).find(e => e.tag === 'div')
    expect(div).toBeDefined()
    // The element under the provider IS the rendered root: `ctx.isRoot`
    // survives `transformProviderElement`.
    expect(div!.needsScope).toBe(true)
    // Relay marker: a name and no value — the value arrives at runtime from
    // whoever renders this component as a keyed row.
    expect(div!.keyAttr).toEqual({ name: 'data-key' })
  })

  test.each([
    ['plain element root', `
      export function C() { return <div class="root"><span>x</span></div> }
    `],
    ['early-return (if-statement) root — every branch top element', `
      export function C(props: { on?: boolean }) {
        if (props.on) return <section>on</section>
        return <article>off</article>
      }
    `],
    ['provider root', PROVIDER_ROOT],
    ['provider wrapping an early-return root', `
      'use client'
      import { createContext } from '@barefootjs/client'
      const Ctx = createContext(0)
      export function C(props: { on?: boolean }) {
        if (props.on) return <Ctx.Provider value={1}><section>on</section></Ctx.Provider>
        return <Ctx.Provider value={0}><article>off</article></Ctx.Provider>
      }
    `],
    ['nested providers around the root element', `
      'use client'
      import { createContext } from '@barefootjs/client'
      const A = createContext(0)
      const B = createContext(0)
      export function C() {
        return <A.Provider value={1}><B.Provider value={2}><div>x</div></B.Provider></A.Provider>
      }
    `],
  ])('invariant: %s — every needsScope element carries a relay keyAttr', (_label, source) => {
    const roots = allElements(compile(source)).filter(e => e.needsScope)
    expect(roots.length).toBeGreaterThan(0)
    for (const el of roots) {
      expect({ tag: el.tag, keyAttr: el.keyAttr }).toEqual({
        tag: el.tag,
        keyAttr: { name: 'data-key' },
      })
    }
  })

  test('an inline .map() row root keeps its own resolved key expression', () => {
    const ir = compile(`
      export function List(props: { items: { id: number; name: string }[] }) {
        return <ul>{props.items.map(i => <li key={i.id}>{i.name}</li>)}</ul>
      }
    `, 'List')

    const li = allElements(ir).find(e => e.tag === 'li')
    expect(li).toBeDefined()
    // Mechanism 1 (a concretely-known local expression) wins over the relay
    // marker; the relay pass must not overwrite it with a bare name.
    expect(li!.needsScope).toBe(false)
    expect(li!.keyAttr).toEqual({ name: 'data-key', value: 'i.id' })

    const ul = allElements(ir).find(e => e.tag === 'ul')!
    expect(ul.needsScope).toBe(true)
    expect(ul.keyAttr).toEqual({ name: 'data-key' })
  })

  test('a scope-comment fragment root marks exactly one carrier, not every child', () => {
    const ir = compile(`
      export function C() {
        return <><h1>title</h1><p>body</p></>
      }
    `)

    expect(ir.type).toBe('fragment')
    const els = allElements(ir)
    // #2732: hydration markers moved to the wrapping comment, so no child is
    // a `needsScope` element and the relay pass adds nothing of its own.
    expect(els.every(e => !e.needsScope)).toBe(true)
    expect(els.filter(e => e.keyAttr !== undefined).map(e => e.tag)).toEqual(['h1'])
  })
})
