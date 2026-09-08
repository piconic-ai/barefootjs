import { createFixture } from '../src/types'

/**
 * #2894 — the go-template sibling of #2883 (Mojolicious): a `+` concat
 * against a bare-props-form BODY-destructured, RENAMED prop (`const {
 * fallbackLabel: skipLabel } = props`, the #2788 alias family), referenced
 * inside a `.map()` row (`t.label + skipLabel`).
 *
 * `collectStringValueNames` (go-template's `props/prop-classes.ts`) had no
 * witness for this alias family — only the type-level `propsParams` names
 * were tracked — so `isStringConcatBinary` never saw `skipLabel` as
 * string-typed and fell through to numeric `bf_add`. Go's `bf_add` coerces
 * both operands through `toFloat64`, so the string operand silently
 * evaluated to `0` instead of concatenating.
 *
 * `t.label` is deliberately the OTHER operand: a loop-element field on an
 * untyped array member is `{kind:'unknown'}` to the analyzer and never
 * itself witnessed, so this fixture isolates `skipLabel`'s alias resolution
 * as the sole thing that can make the concat classify correctly (mirrors
 * `isStringConcatBinary`'s own "only ONE identifier operand needs to be
 * string-typed" contract, `string-concat-identifier.test.ts`).
 */
export const fixture = createFixture({
  id: 'string-concat-plus-renamed-prop',
  description: '+ concat against a renamed body-destructured prop, referenced inside a .map() row (#2894)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Todo = { id: number; label: string }

export function StringConcatPlusRenamedProp(props: { fallbackLabel: string }) {
  const { fallbackLabel: skipLabel } = props
  const [todos] = createSignal<Todo[]>([{ id: 1, label: 'Alpha' }])
  return (
    <ul>
      {todos().map(t => (
        <li key={t.id}>{t.label + skipLabel}</li>
      ))}
    </ul>
  )
}
`,
  props: {
    fallbackLabel: '!',
  },
  expectedHtml: `
    <ul bf-s="test" bf="s2"><li bf="s1" data-key="1"><!--bf:s0-->Alpha!<!--/--></li></ul>
  `,
})
