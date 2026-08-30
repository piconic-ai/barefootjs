import { createFixture } from '../src/types'

/**
 * An unguarded `{props.children}` in a child component, called by a parent
 * that passes no children at all — #2775. The `children` key is simply
 * absent from the props object in that case (`materializeComponent`,
 * `packages/client/src/runtime/component.ts`), so a bare `${_p.children}`
 * splice in the client template used to stringify the `undefined` value
 * into the literal text "undefined" on a pure-CSR mount, while SSR (and
 * SSR+hydration) rendered nothing — a three-way contract break visible
 * only on the CSR-mount leg. Hono is correct here: its JSX runtime renders
 * `undefined` as no text at all, so `expectedHtml` below is generated from
 * it unmodified.
 *
 * Deliberately UNGUARDED (`{props.children}`, not `{props.children ?? ''}`)
 * — a guard at the source would route around the defect the way
 * `jsx-element-prop-no-children` and `component-with-jsx-children` used to,
 * leaving it unpinned. See those two fixtures for the guard this one
 * replaces as the reason to keep them unguarded now that #2775 is fixed.
 */
export const fixture = createFixture({
  id: 'children-passthrough-no-children',
  description: 'An unguarded {props.children} renders nothing when the caller passes no children',
  source: `
import { Card } from './card'
export function Page() {
  return <Card header="H" />
}
`,
  components: {
    './card.tsx': `
export function Card(props: { header?: unknown; children?: unknown }) {
  return (
    <div class="card">
      <h2>{props.header}</h2>
      {props.children}
    </div>
  )
}
`,
  },
  expectedHtml: `
    <div bf-s="test_s0" class="card"><h2 bf="s1"><!--bf:s0-->H<!--/--></h2></div>
  `,
})
