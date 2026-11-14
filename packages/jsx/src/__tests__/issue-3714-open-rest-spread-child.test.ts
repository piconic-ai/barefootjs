/**
 * #3714 — an open-type `{...rest}` bag spread onto a child component in the
 * client JS.
 *
 * The client holds the rest bag as the caller's whole props object (`_p`),
 * so Phase 1 lists the caller keys the bag leaves out on the spread
 * (`SpreadAttr.restOmittedKeys`): the keys the component destructured, from
 * the signature or from a body destructure of the props object. Every
 * reader of the bag takes them out: `initChild`'s `forwardProps(...)`, the
 * registration template's `renderChild(...)` props, and `applyRestAttrs`.
 *
 * The rendered output is pinned by the `open-rest-spread-child*` and
 * `open-body-rest-spread-*` conformance fixtures, in a real browser by
 * `e2e/fixture-hydrate.playwright.ts` and `e2e/oracle.playwright.ts`.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import type { AttrValue, IRNode } from '../types'

const adapter = new TestAdapter()

function clientJs(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  return result.files.find(f => f.type === 'clientJs')!.content
}

/** Every spread value in `node`'s subtree, on elements and on component calls, in source order. */
function spreads(node: IRNode, out: AttrValue[] = []): AttrValue[] {
  const attrs = node.type === 'element' ? node.attrs : node.type === 'component' ? node.props : []
  for (const attr of attrs) if (attr.value.kind === 'spread') out.push(attr.value)
  if (node.type === 'conditional') {
    spreads(node.whenTrue, out)
    spreads(node.whenFalse, out)
  }
  const children = 'children' in node && Array.isArray(node.children) ? (node.children as IRNode[]) : []
  for (const child of children) spreads(child, out)
  return out
}

function spreadsOf(source: string, componentName: string): AttrValue[] {
  return spreads(jsxToIR(analyzeComponent(source, 'Repro.tsx', componentName))!)
}

const OPEN = '{ title?: string; label?: string; kind?: string; tone?: string; [key: string]: unknown }'

describe('#3714 — Phase 1 lists the keys a rest bag leaves out', () => {
  test('a signature rest omits every destructured key, by its caller-facing name', () => {
    const [onChild, onElement] = spreadsOf(`
      import { Tag } from './tag'
      export function A({ title, label: text, kind = 'k', ...rest }: ${OPEN}) {
        return <p title={title} lang={text} dir={kind}><Tag {...rest} /><i {...rest} /></p>
      }
    `, 'A')
    expect(onChild).toMatchObject({ callerBag: 'rest', restOmittedKeys: ['title', 'label', 'kind'] })
    expect(onElement).toMatchObject({ callerBag: 'rest', restOmittedKeys: ['title', 'label', 'kind'] })
  })

  test('a body rest omits only the keys its destructure takes, through an alias too', () => {
    const [direct, aliased] = spreadsOf(`
      import { Tag } from './tag'
      export function B(props: ${OPEN}) {
        const { title, ...rest } = props
        const bag = rest
        return <p title={title}><Tag {...rest} /><Tag {...bag} /></p>
      }
    `, 'B')
    expect(direct).toMatchObject({ callerBag: 'rest', restOmittedKeys: ['title'] })
    expect(aliased).toMatchObject({ callerBag: 'rest', restOmittedKeys: ['title'] })
  })

  test('the props object and a loop row named like the rest carry no omit list', () => {
    const [props] = spreadsOf(`
      import { Tag } from './tag'
      export function C(props: ${OPEN}) { return <p><Tag {...props} /></p> }
    `, 'C')
    expect(props).toMatchObject({ callerBag: 'props' })
    expect(props).not.toHaveProperty('restOmittedKeys')
    const [row] = spreadsOf(`
      import { Tag } from './tag'
      export function D({ rows, ...rest }: { rows: Array<{ tone: string }>; [key: string]: unknown }) {
        return <ul>{rows.map(rest => <li><Tag {...rest} /></li>)}</ul>
      }
    `, 'D')
    expect(row).not.toHaveProperty('callerBag')
    expect(row).not.toHaveProperty('restOmittedKeys')
  })
})

describe('#3714 — the client reads a rest bag without the destructured keys', () => {
  const js = clientJs(`
    'use client'
    import { Tag } from './tag'
    export function Card({ title, label: text, items, ...rest }: { title?: string; label?: string; items: string[]; tone?: string; [key: string]: unknown }) {
      return (
        <div title={title} lang={text}>
          <Tag {...rest} />
          <Tag title="x" tone="first" {...rest} />
          <Tag {...rest} tone="last" />
          {title ? <Tag {...rest} /> : null}
          <ul>{items.map(it => <li key={it}><Tag label={it} {...rest} /></li>)}</ul>
          <i {...rest} />
        </div>
      )
    }
  `)

  test('initChild forwards the bag without them, and merges in source order', () => {
    // No explicit prop: only the destructured keys are held back.
    expect(js).toContain(`forwardProps(_p, {}, ["title","label","items"])`)
    // `title` is not in the bag, so the explicit one stays as written; the
    // caller's `tone` overrides the one written before the spread.
    expect(js).toContain(`forwardProps(_p, { title: "x", get tone() { return ("tone" in _p ? _p["tone"] : "first") } }, ["title","tone","label","items"])`)
    // An explicit prop after the spread wins as written.
    expect(js).toContain(`forwardProps(_p, { tone: "last" }, ["tone","title","label","items"])`)
  })

  test('a loop row and a conditional branch forward the bag too', () => {
    expect(js).toContain(`upsertChild(__el, 'Tag', 's5', forwardProps(_p, { get label() { return it() } }, ["label","title","items"])`)
    expect(js).toContain(`if (__c0) initChild('Tag', __c0, forwardProps(_p, {}, ["title","label","items"]))`)
  })

  test('the registration template spreads the bag at its source position', () => {
    const bag = `...forwardProps(_p, {}, ["title","label","items"])`
    expect(js).toContain(`renderChild('Tag', {${bag}}, undefined, 's0')`)
    expect(js).toContain(`renderChild('Tag', {title: "x", tone: "first", ${bag}}, undefined, 's1')`)
    expect(js).toContain(`renderChild('Tag', {${bag}, tone: "last"}, undefined, 's2')`)
    expect(js).toContain(`renderChild('Tag', {label: it, ${bag}}, undefined, 's5')`)
  })

  test('an element spread keeps its exclusion list', () => {
    expect(js).toContain(`applyRestAttrs(_s7, _p, ["title","label","items"])`)
  })

  test('a body rest holds back only the keys its destructure takes', () => {
    const body = clientJs(`
      'use client'
      import { Tag } from './tag'
      export function Card(props: { title?: string; tone?: string; [key: string]: unknown }) {
        const { title, ...rest } = props
        return <div title={title}><Tag tone="first" {...rest} /><i {...rest} /></div>
      }
    `)
    expect(body).toContain(`forwardProps(_p, { get tone() { return ("tone" in _p ? _p["tone"] : "first") } }, ["tone","title"])`)
    expect(body).toContain(`renderChild('Tag', {tone: "first", ...forwardProps(_p, {}, ["title"])}, undefined, 's0')`)
    expect(body).toContain(`applyRestAttrs(_s1, _p, ["title"])`)
  })

  test("the call's own children passed through stay forwarded", () => {
    // `<Slot {...rest}>{children}</Slot>`: this builder spells no `children`
    // entry, so the child reads the caller's own off the forwarded props.
    const passthrough = clientJs(`
      'use client'
      import { Slot } from './slot'
      export function Kbd({ className, children, ...rest }: { className?: string; children?: unknown; [key: string]: unknown }) {
        return <div><Slot className={className} {...rest}>{children}</Slot></div>
      }
    `)
    expect(passthrough).toContain(`}, ["className"]))`)
    // Other children are the call's own, not the caller's.
    const own = clientJs(`
      'use client'
      import { Slot } from './slot'
      export function Kbd({ className, children, ...rest }: { className?: string; children?: unknown; [key: string]: unknown }) {
        return <div title={String(children)}><Slot className={className} {...rest}><b>x</b></Slot></div>
      }
    `)
    expect(own).toContain(`}, ["className","children"]))`)
  })
})
