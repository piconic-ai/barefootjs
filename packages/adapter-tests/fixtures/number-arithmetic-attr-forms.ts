import { createFixture } from '../src/types'

/**
 * Companion of `number-arithmetic-attr-formatting` (#3359): attribute values
 * keep the JavaScript number spelling across a negative result, an integral
 * result, a ternary whose taken branch is arithmetic (including one whose
 * `undefined` alternate omits the attribute), and a boxed numeric
 * memo read. The decimal/exponent boundaries have their own fixture,
 * `number-arithmetic-attr-exponent-boundaries`.
 */
export const fixture = createFixture({
  id: 'number-arithmetic-attr-forms',
  description: 'Attribute arithmetic keeps JavaScript number spelling for negative, integral, ternary and memo values',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function NumberArithmeticAttrForms(props: { value: number }) {
  const [half] = createSignal(0.5)
  const total = createMemo(() => props.value + half())
  return (
    <div
      data-neg={-props.value - 0.5}
      data-int={props.value * 2}
      data-pick={props.value > 0 ? props.value + 0.25 : 'none'}
      data-maybe={props.value > 0 ? props.value + 0.75 : undefined}
      data-gone={props.value < 0 ? props.value + 0.75 : undefined}
      data-memo={total()}
    >
      x
    </div>
  )
}
`,
  props: { value: 1234567890 },
  expectedHtml: `
    <div bf-s="test" bf="s0" data-int="2469135780" data-maybe="1234567890.75" data-memo="1234567890.5" data-neg="-1234567890.5" data-pick="1234567890.25">x</div>
  `,
})
