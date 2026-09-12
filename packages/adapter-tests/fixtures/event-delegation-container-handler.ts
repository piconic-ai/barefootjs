import { createFixture } from '../src/types'

/**
 * #2930 — a `.map()` row's `stopPropagation()` must stop its static
 * container's OWN directly-authored handler for the same event.
 *
 * `.map()` rows compile via event delegation: the compiler registers ONE
 * `addEventListener` on the container, resolving `event.target` back to a
 * row via `closest()`. When the container ALSO carries its own handler for
 * the same event (`onContextMenu` on `<div className="container">` here),
 * both used to become separate `addEventListener` calls on the identical
 * DOM node — so a row's `stopPropagation()` couldn't stop the container's
 * handler (native DOM `stopPropagation()` only blocks bubbling to OTHER
 * nodes, never other listeners already registered on the SAME node).
 *
 * `expectedHtml` is unaffected — this bug is client-JS-emission-only (SSR's
 * static markup is identical either way). The regression pin lives in
 * `packages/jsx/src/__tests__/event-delegation-container-collision-2930.test.ts`
 * (compiled client JS shape: exactly one `addEventListener('contextmenu', …)`
 * on the shared container, gated by `!__bfEvt.cancelBubble`) and in
 * `packages/client/__tests__/runtime/event-delegation-container-handler-2930.test.ts`
 * (a real happy-dom `contextmenu` dispatch, matching this fixture's shape,
 * proving the row's `stopPropagation()` actually suppresses the container's
 * handler end to end). This fixture's own role is narrower: pin that the
 * fix does not change SSR output or break compilation for this shape.
 */
export const fixture = createFixture({
  id: 'event-delegation-container-handler',
  description: 'Row stopPropagation() vs. a static container\'s own handler for the same event (#2930)',
  source: `
'use client'
const items = ['a', 'b', 'c']
export function EventDelegationContainerHandler() {
  return (
    <div
      className="container"
      onContextMenu={(e) => {
        e.preventDefault()
        console.log('container handler')
      }}
    >
      {items.map(item => (
        <div
          key={item}
          data-item={item}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            console.log('row handler', item)
          }}
        >
          row {item}
        </div>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2" class="container">
      <div bf="s1" data-item="a" data-key="a"> row <!--bf:s0-->a<!--/--></div>
      <div bf="s1" data-item="b" data-key="b"> row <!--bf:s0-->b<!--/--></div>
      <div bf="s1" data-item="c" data-key="c"> row <!--bf:s0-->c<!--/--></div>
    </div>
  `,
})
