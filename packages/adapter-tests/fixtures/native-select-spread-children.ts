import { createFixture } from '../src/types'

/**
 * #1633 regression: a component that forwards `children` onto an
 * element which ALSO carries a `{...props}` spread must materialize
 * those children in the CSR path, not just SSR.
 *
 * The original NativeSelect bug came from a self-closing host that
 * received children implicitly through `{...props}`
 * (`<select {...props} />`). SSR materialized them but the CSR
 * template path rendered a childless `<select>`. The fix is to pull
 * `children` out of the rest bag and place it explicitly alongside
 * the spread (`<select {...props}>{children}</select>`). This fixture
 * pins that the explicit-children + spread shape lowers to the same
 * HTML under both Hono SSR and the CSR template path.
 *
 * Shape note: the children-host is the child component's ROOT element
 * and the slotted children are intrinsic `<option>`s (literal attrs),
 * not nested child components. That keeps the fixture clear of the
 * known CSR spread-bag harness limitation (parent-supplied runtime
 * spread props on a child component's root — see the `jsx-spread-*`
 * entries in csr-conformance's skip set) so the regression it guards
 * (children materialization) is the only thing under test.
 *
 * Adapter coverage: Hono SSR, Go SSR, the CSR template path and Mojo
 * SSR all render this fixture. Go plumbs the destructured rest bag
 * (`{ children, ...props }`) via its `Spread_0`/`Extras map[string]any`
 * Input field; the Mojo runtime seeds the same bag into the child
 * template stash from the manifest's `ssrDefaults` (`isRestProps`), and
 * the test harness's `buildChildRenderers` defaults it to an empty
 * hashref so `bf->spread_attrs($props)` reads a defined `$props`
 * (#1652).
 */
export const fixture = createFixture({
  id: 'native-select-spread-children',
  description: 'Children placed alongside a {...props} spread materialize in CSR',
  source: `
'use client'
import { NativeSelect } from './native-select'
export function NativeSelectComposition() {
  return (
    <NativeSelect>
      <option data-slot="native-select-option" value="1">Option 1</option>
      <option data-slot="native-select-option" value="2">Option 2</option>
    </NativeSelect>
  )
}
`,
  components: {
    './native-select.tsx': `
'use client'
import type { SelectHTMLAttributes } from '@barefootjs/jsx'
export function NativeSelect({ children, ...props }: SelectHTMLAttributes) {
  return <select data-slot="native-select" {...props}>{children}</select>
}
`,
  },
  expectedHtml: `
    <select bf-s="test_s0" bf="s0" data-slot="native-select">
      <option data-slot="native-select-option" value="1">Option 1</option>
      <option data-slot="native-select-option" value="2">Option 2</option>
    </select>
  `,
})
