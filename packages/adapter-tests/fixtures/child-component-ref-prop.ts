import { createFixture } from '../src/types'

/**
 * #2749 — a `ref` on a CHILD-COMPONENT call site is a compile-time binding to
 * the child's runtime root element, never a rendered attribute. The child here
 * forwards `{...rest}` onto its own root, so the `ref` travels through the
 * component-props path (`initChild`'s `get ref()` getter) and is applied by the
 * runtime's `applyRestAttrs`, whose `classifyDOMProp` read returns
 * `kind: 'ref'` and INVOKES the callback.
 *
 * `expectedHtml` therefore carries no `ref` attribute on either leg.
 *
 * Honesty note about what this fixture can and cannot catch (per the
 * three-piece-set rule): it does NOT go red on the pre-#2749 compiler. The
 * defect lived only in the client-JS `init` builder
 * (`collectReactiveChildProps`, collect-elements.ts), which mirrored the
 * callback's source text with `setAttribute('ref', String(__v))` at HYDRATION
 * time. No conformance layer in this package evaluates a component's `init`
 * against a DOM — the SSR and CSR legs both render templates only, and the
 * template builder already filtered `ref` out. The executable pin for the
 * regression is:
 *
 *   - packages/jsx/src/__tests__/child-component-ref-not-mirrored.test.ts
 *     (asserts the emitted client JS has no `setAttribute('ref'` and still
 *     carries `get ref()` into `initChild`)
 *
 * This fixture's job is the durable statement of the CORRECT rendered output
 * on every adapter, so a future adapter cannot start emitting `ref=` silently.
 */
export const fixture = createFixture({
  id: 'child-component-ref-prop',
  description: 'ref on a child-component call site never renders as an attribute on any adapter',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Row } from './row'
export function RefOnChild() {
  const [val, setVal] = createSignal(0)
  const handleMount = (el: Element) => {
    el.setAttribute('data-mounted', String(val()))
  }
  return (
    <div>
      <Row ref={handleMount}><span>{val()}</span></Row>
      <button onClick={() => setVal(val() + 1)}>inc</button>
    </div>
  )
}
`,
  components: {
    './row.tsx': `
export function Row({ children, ...rest }: { children?: unknown; [key: string]: unknown }) {
  return <div {...rest}>{children}</div>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <div bf-s="test_s2" bf="s0"><span bf="^s1"><!--bf:^s0-->0<!--/--></span></div>
      <button bf="s3">inc</button>
    </div>
  `,
})
