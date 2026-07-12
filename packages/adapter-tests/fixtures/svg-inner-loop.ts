import { createFixture } from '../src/types'

/**
 * An inner reactive `.map()` rendering SVG elements (`<line>`) whose ITEMS
 * live inside an outer reactive loop of `<svg>` containers (#2219, fixed in
 * PR #2233). `svg-icon` pins a single static `<svg>`; `fragment-loop-children`
 * pins a single-level loop *inside* one static `<svg>`; this pins the
 * doubly-nested shape that actually threw: an outer `sheets().map()` whose
 * body is itself an `<svg key={...}>`, containing an inner `s.ticks.map()`
 * whose body is a bare SVG leaf (`<line key={...}>`). Both loop levels
 * require `key` (BF024 for the inner map, BF023 for the outer).
 *
 * This fixture pins cross-adapter SSR / CSR-template markup parity only
 * (byte-identical HTML/template output across adapters, including
 * `viewBox`'s case-sensitive casing surviving nested-loop codegen). The
 * runtime bug itself — freshly-CREATED `<line>` items cloning as
 * `HTMLUnknownElement` instead of `SVGLineElement` because the inner loop's
 * `template.innerHTML` parse never got the `<svg>` namespace wrap — can't be
 * regression-pinned here: `csr-conformance.test.ts` only evaluates the
 * compiled `template()` lambda's static markup and never executes the
 * `mapArray` renderItem clone IIFE where the bug lived. That's covered by
 * `packages/client/__tests__/runtime/inner-loop-svg-namespace-e2e.test.ts`,
 * which mounts real compiled client JS in happy-dom and asserts
 * `namespaceURI` on freshly-created `<line>` elements.
 *
 * The signal is explicitly typed (`createSignal<Sheet[]>`) — required for
 * the Go adapter, whose SSR data context bakes an object-array signal
 * initial value only against a concrete local struct (`parsedLiteralToGo`
 * defers object literals inside an untyped `[]interface{}` to `nil`, which
 * renders an empty container). Initial data is non-empty (two sheets, one
 * with two ticks, one with one) so SSR actually exercises the inner loop
 * rather than only pinning the empty-array shape.
 */
export const fixture = createFixture({
  id: 'svg-inner-loop',
  description: 'Inner reactive .map() of SVG leaves inside an outer reactive loop of <svg> containers',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Sheet = { id: number; ticks: number[] }
export function SvgInnerLoop() {
  const [sheets] = createSignal<Sheet[]>([
    { id: 1, ticks: [10, 20] },
    { id: 2, ticks: [30] },
  ])
  return (
    <div>
      {sheets().map((sheet) => (
        <svg key={sheet.id} viewBox="0 0 100 100">
          {sheet.ticks.map((y) => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} />
          ))}
        </svg>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <svg bf="s1" data-key="1" viewBox="0 0 100 100">
        <line bf="s0" data-key-1="10" x1="0" x2="100" y1="10" y2="10"></line>
        <line bf="s0" data-key-1="20" x1="0" x2="100" y1="20" y2="20"></line>
      </svg>
      <svg bf="s1" data-key="2" viewBox="0 0 100 100"><line bf="s0" data-key-1="30" x1="0" x2="100" y1="30" y2="30"></line></svg>
    </div>
  `,
})
