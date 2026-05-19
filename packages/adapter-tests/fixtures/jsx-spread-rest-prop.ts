import { createFixture } from '../src/types'

/**
 * Compiler stress (#1407 follow-up): destructured-rest spread on
 * an intrinsic element — the shape used by the scaffolded Button
 * (`function({ a, ...rest }: P) { <el {...rest}/> }`). Before
 * this fixture landed, the Go adapter raised BF101 because its
 * `buildSpreadInitializer` only recognised explicitly-destructured
 * propsParams, not the rest binding name.
 *
 * The prop type uses an index signature (`[key: string]: unknown`)
 * so the analyzer's `restPropsExpandedKeys` can't enumerate a
 * fixed key set — that's the case where the open-ended bag path
 * is actually needed (a closed type would route through the auto-
 * expansion at `jsx-to-ir.ts` instead). The Go adapter plumbs an
 * Input-side `Extras map[string]any` field that the caller (parent
 * component or test harness) populates with the runtime rest
 * payload.
 *
 * This fixture pins the COMPILE-time contract: the component
 * source must not raise BF101 under any adapter. The runtime
 * payload is supplied empty here; end-to-end runtime parity for
 * the open-ended bag shape is a harness-plumbing concern tracked
 * separately (the test harness can't reconcile flat JS-side spread
 * shape with Go's typed Input struct without IR introspection).
 */
export const fixture = createFixture({
  id: 'jsx-spread-rest-prop',
  description: 'Destructured-rest identifier spread compiles cleanly',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type P = { greeting: string; [key: string]: unknown }
export function JsxSpreadRestProp({ greeting, ...extras }: P) {
  const [n, setN] = createSignal(0)
  return <div onClick={() => setN(n() + 1)} {...extras}>{greeting}</div>
}
`,
  props: {
    greeting: 'hi',
  },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->hi<!--/--></div>
  `,
})
