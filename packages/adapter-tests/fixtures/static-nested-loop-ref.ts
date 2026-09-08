import { createFixture } from '../src/types'

/**
 * #2798 — a static (non-signal) array's `.map()` invokes a `ref`
 * callback on each row, and reactively updates a signal-derived text,
 * on the TOP-LEVEL row (`buildStaticLoopPlan`). But a nested `.map()`
 * INSIDE a static outer row's item, over PLAIN ELEMENTS (not child
 * components), reached `elem.innerLoops` processing only when it had
 * matching depth-N child components — `buildStaticArrayChildInitsPlan`
 * skipped a plain-element inner loop entirely
 * (`innerComps.length === 0` continue), so the row was silently
 * frozen: no ref invocation, no reactive text/attr effect, even though
 * both the OUTER row's own bindings and a depth-N CHILD COMPONENT
 * inner loop were faithfully wired.
 *
 * `items` is a plain literal array (not signal-backed) specifically to
 * take the static fast path — contrast with `nested-loop-ref-const.ts`
 * (#2750), which needs a signal-backed array because ITS shape is
 * depth-2, past this fix's depth-1 scope.
 *
 * `expectedHtml` is unaffected by the fix — SSR never runs a `ref`
 * callback at all (a `ref`'s DOM mutation only exists client-side, the
 * same reasoning `nested-loop-ref-const.ts` documents), and this
 * fixture's `data-key`/text markup was already correct pre-fix. The
 * regression pin is the emitted client JS shape, asserted directly in
 * `packages/jsx/src/__tests__/issue-2798-static-nested-loop-bindings.test.ts`
 * (this fixture proves the SAME source compiles to correct SSR markup
 * across every adapter; that test proves the client JS wiring).
 */
export const fixture = createFixture({
  id: 'static-nested-loop-ref',
  description: 'a ref callback and a signal-derived text inside a nested .map() under a static (non-signal) outer array are wired up (#2798)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function StaticNestedLoopRef() {
  const items = [{ id: 1, children: [{ id: 11 }, { id: 12 }] }]
  const [count] = createSignal(0)
  const trackMount = (el: Element) => { el.setAttribute('data-tracked', '1') }
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          {item.children.map(child => (
            <span key={child.id} ref={trackMount}>{child.id}:{count()}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s4"><li bf="s3" data-key="1"><span bf="s2" data-key-1="11"><!--bf:s0-->11<!--/-->:<!--bf:s1-->0<!--/--></span><span bf="s2" data-key-1="12"><!--bf:s0-->12<!--/-->:<!--bf:s1-->0<!--/--></span></li></ul>
  `,
})
