/**
 * `bfMarkup()` branding for JSX-element-as-non-children-component-prop
 * values (#2651), sound-or-loud at the client-JS emit layer.
 *
 * Before the fix, a JSX element passed at a non-`children` component prop
 * position (`header={<strong>Title</strong>}`) reached the CSR template as
 * a bare HTML string; the receiving component's own `{props.header}`
 * interpolation is a claim-plan `kind: 'markup'` slot (its value may be a
 * live `Node`), but the STATIC template builder always called `escapeText`
 * regardless of that classification — so the compiler-built markup came
 * out HTML-escaped (`&lt;strong&gt;`) instead of raw, and the sentinel
 * scope-placeholder embedded inside it (`bf-s="__BF_PARENT_SCOPE__"`) came
 * out mangled (`&quot;`) and never got substituted (fixture
 * `jsx-element-prop`, `packages/adapter-tests/fixtures/jsx-element-prop.ts`).
 *
 * The fix carries the compiler-built HTML as a `bfMarkup()`-branded value
 * from every producer door to the two consumers (`escapeTextOrMarkup` for
 * the static template, `escapeTextOrNode` for the reactive write) instead
 * of a bare string — see `packages/client/__tests__/runtime/markup-brand.test.ts`
 * for the runtime-helper contract itself. This file pins the COMPILER side:
 * which producer emissions get branded, which stay untouched, and that the
 * markup-classified slot's template evaluation switches escape functions.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string, filePath = 'Test.tsx'): string {
  const result = compileJSX(source, filePath, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('markup-prop brand (#2651)', () => {
  // The exact shape `jsx-element-prop` exercises: a single JSX element
  // passed at a non-`children` prop position, alongside real children.
  const singleElementSource = `
    export function Card(props: { header?: any; children?: any }) {
      return (
        <section>
          <header>{props.header}</header>
          <div>{props.children}</div>
        </section>
      )
    }
    export function JsxElementProp() {
      return (
        <Card header={<strong>Title</strong>}>
          <p>body text</p>
        </Card>
      )
    }
  `

  test('(a) renderChild / static-template prop emission wraps the JSX-element prop in bfMarkup(...)', () => {
    const clientJs = clientJsFor(singleElementSource)
    // The parent's static template calls renderChild('Card', {header: bfMarkup(`...`), ...}, ...) —
    // not a bare backtick string.
    expect(clientJs).toMatch(/renderChild\('Card',\s*\{header:\s*bfMarkup\(`<strong[^`]*Title[^`]*<\/strong>`\)/)
  })

  test('(b) initChild getter prop emission wraps the JSX-element prop in bfMarkup(...)', () => {
    const clientJs = clientJsFor(singleElementSource)
    // initChild('Card', _s0, { get header() { return bfMarkup(`<strong>Title</strong>`) } })
    expect(clientJs).toMatch(/get header\(\)\s*\{\s*return bfMarkup\(`<strong>Title<\/strong>`\)\s*\}/)
  })

  test("(c) the receiving component's markup-classified slot uses escapeTextOrMarkup, not escapeText", () => {
    const clientJs = clientJsFor(singleElementSource)
    expect(clientJs).toContain('escapeTextOrMarkup(_p.header)')
    expect(clientJs).not.toContain('escapeText(_p.header)')
    // The reactive write for the same slot already went through
    // escapeTextOrNode before this fix; still present, now brand-aware.
    expect(clientJs).toContain('escapeTextOrNode(__val)')
  })

  test('(d) a plain string prop (no JSX literal) is never branded and keeps the plain expression form', () => {
    const source = `
      export function Card(props: { header?: any }) {
        return <header>{props.header}</header>
      }
      export function PlainStringProp(props: { label: string }) {
        return <Card header={props.label} />
      }
    `
    const clientJs = clientJsFor(source)
    expect(clientJs).not.toContain('bfMarkup(')
    // The prop stays a bare expression reference — `expression` AttrValue
    // kind, not `jsx-children` — routed straight through to `renderChild`.
    expect(clientJs).toMatch(/renderChild\('Card',\s*\{header:\s*_p\.label\}/)
    // The slot is still claim-plan 'markup' (any component prop can be
    // dynamic) — escapeTextOrMarkup is still the right call, just never
    // fed a branded value here.
    expect(clientJs).toContain('escapeTextOrMarkup(_p.header)')
  })

  test('(e) an explicit `children={<jsx/>}` prop is excluded from branding (out of scope, byte-invariant)', () => {
    const source = `
      function Box({ children }: { children: any }) { return <div>{children}</div> }
      export function ChildrenJsxExpression() {
        return <Box children={<span>x</span>} />
      }
    `
    const clientJs = clientJsFor(source)
    expect(clientJs).not.toContain('bfMarkup(')
    expect(clientJs).toContain('children: `<span bf-s="__BF_PARENT_SCOPE__">x</span>`')
    expect(clientJs).toContain('get children() { return `<span>x</span>` }')
  })

  test('(f) between-tag JSX children stay byte-invariant (out of scope, unbranded)', () => {
    const source = `
      export function Card(props: { header?: any; children?: any }) {
        return (
          <section>
            <header>{props.header}</header>
            <div>{props.children}</div>
          </section>
        )
      }
      export function JsxElementProp() {
        return (
          <Card header={<strong>Title</strong>}>
            <p>body text</p>
          </Card>
        )
      }
    `
    const clientJs = clientJsFor(source)
    // The between-tag `<p>body text</p>` children entry is a plain
    // backtick string, never wrapped — only the non-`children` `header`
    // prop next to it is branded.
    expect(clientJs).toContain('children: `<p>body text</p>`')
  })

  test('(g) a JSX element nested inside another component prop value (door via createComponent getters) is also branded', () => {
    // `header` itself contains a component (`Wrapper`), which routes
    // through the `__slot(...)` live-node mechanism (unaffected by this
    // fix); `Wrapper`'s OWN `bar` prop is a lone JSX element and reaches
    // the SAME brand through the nested `irNodeToJsExprs` door.
    const source = `
      export function Wrapper(props: { bar?: any }) {
        return <em>{props.bar}</em>
      }
      export function Card(props: { header?: any }) {
        return <header>{props.header}</header>
      }
      export function NestedJsxProp() {
        return <Card header={<Wrapper bar={<b>Nested</b>} />} />
      }
    `
    const clientJs = clientJsFor(source)
    expect(clientJs).toMatch(/get bar\(\)\s*\{\s*return bfMarkup\(`<b>Nested<\/b>`\)\s*\}/)
    // The outer `header` (contains a component) keeps the pre-existing
    // `__slot(...)` live-node wrapping — not itself re-wrapped in bfMarkup.
    expect(clientJs).toMatch(/get header\(\)\s*\{\s*return __slot\(/)
  })

  // KNOWN BUG (#2702) — pins the CURRENT (broken) emission, not the
  // correct one. `isSingleElementJsxChildren` (`ir-to-client-js/collect-
  // elements.ts`) only brands the single-element jsx-children shape;
  // #2651's PR body enumerated "conditional-in-fragment" as deliberately
  // out of that PR's scope, and #2702 confirms it is actually broken, not
  // merely unbranded-but-harmless: the child's own `escapeTextOrNode`
  // reactive effect re-escapes the chosen branch's HTML as literal text
  // the moment it first runs (real DOM corruption, verified directly —
  // see `jsx-element-prop-fragment-conditional`'s fixture docstring,
  // `packages/adapter-tests/fixtures/`, for the full mechanism and why no
  // other shared conformance suite observes it: SSR is genuinely correct,
  // and CSR conformance's `createEffect` mock never runs the effect).
  //
  // Graduation: once `bfMarkup()` branding is extended to this multi-part
  // shape, this assertion starts failing — replace it with a positive
  // `bfMarkup(...)`-wrapped assertion (mirroring test (b) above) and
  // delete this comment block; that is the fixture's own graduation
  // trigger too (its `expectedHtml` is already the correct SSR output, so
  // no fixture change is needed, only this pin's removal and #2667's
  // BF021 suggestion regaining the fragment-wrap escape).
  test('(h) KNOWN BUG (#2702): a conditional-in-fragment jsx-children prop reaches initChild UNbranded', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Card(props: { header?: any; children?: any }) {
        return (
          <section>
            <header>{props.header}</header>
            <div>{props.children}</div>
          </section>
        )
      }
      export function JsxElementPropFragmentConditional() {
        const [cond, setCond] = createSignal(true)
        return (
          <Card header={<>{cond() ? <a>x</a> : <b>y</b>}</>}>
            <p>body text</p>
          </Card>
        )
      }
    `
    const clientJs = clientJsFor(source)
    // Bug: the getter returns a bare template-literal ternary — NOT
    // wrapped in bfMarkup(...). If this ever starts matching bfMarkup(...)
    // the bug is fixed; see the graduation note above.
    expect(clientJs).toMatch(/get header\(\)\s*\{\s*return cond\(\)\s*\?\s*`<a>x<\/a>`\s*:\s*`<b>y<\/b>`\s*\}/)
    expect(clientJs).not.toMatch(/get header\(\)\s*\{\s*return bfMarkup\(/)
  })
})
