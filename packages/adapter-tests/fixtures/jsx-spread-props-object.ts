import { createFixture } from '../src/types'

/**
 * Compiler stress (#1407 follow-up): SolidJS-style props identifier
 * spread on an intrinsic element
 * (`function(props: P) { <el {...props}/> }`). Before this fixture
 * landed, the Go adapter raised BF101 because its
 * `buildSpreadInitializer` only recognised explicitly-destructured
 * propsParams, not the SolidJS-style single props parameter.
 *
 * The Go adapter now enumerates the analyzer-extracted propsParams
 * (every property of P becomes a propsParam in this shape) into a
 * `map[string]any{ "key": in.Key, ... }` literal at NewXxxProps
 * time. The Mojo adapter does the same via an inline Perl hashref.
 * Both render the bag through the same JS-reference helper as the
 * other spread fixtures.
 *
 * The signal + click handler is incidental — it forces the
 * compiler to allocate a `bf-s` scope on the element so the CSR
 * runtime's `applyRestAttrs` hydration path has a slot id to bind
 * against (intrinsic-element spreads without a reactive sibling
 * are otherwise inert at the IR level).
 */
export const fixture = createFixture({
  id: 'jsx-spread-props-object',
  description: 'SolidJS-style props identifier spread on an intrinsic element',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type P = { label: string; tag: string }
export function JsxSpreadPropsObject(props: P) {
  const [n, setN] = createSignal(0)
  return <div onClick={() => setN(n() + 1)} {...props} />
}
`,
  props: {
    label: 'a',
    tag: 'on',
  },
  expectedHtml: `
    <div bf-s="test" bf="s0" label="a" tag="on"></div>
  `,
})
