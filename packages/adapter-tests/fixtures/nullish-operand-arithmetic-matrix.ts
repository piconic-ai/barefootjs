import { createFixture } from '../src/types'

/**
 * Arithmetic over a `null` operand read directly, with no memo between
 * (#3474): a signal seeded with `null` and a `number | null` prop passed as
 * `null`, each in an attribute and in text, under `+`, `-`, `*` and `/`.
 * JS reads `null` as `0` in arithmetic, so `null + 1` is `1`. Before #3474
 * Jinja, MiniJinja and ERB raised on the nil operand under `+` and for any
 * prop operand; every DSL adapter now coerces it alike
 * (`arithmeticOperandCoercion`). The memo shape has its own fixture
 * (`nullish-signal-arithmetic-memo`); an omitted optional prop, which JS
 * reads as `undefined` (`NaN` in arithmetic), is
 * `omitted-optional-number-arithmetic`.
 */
export const fixture = createFixture({
  id: 'nullish-operand-arithmetic-matrix',
  description: 'Arithmetic over null operands read directly, in attribute and text',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NullishOperandArithmetic(props: { nothing: number | null }) {
  const [n] = createSignal<number | null>(null)
  return (
    <p data-signal={n() + 1} data-nothing={props.nothing - 1}>
      <span>{n() * 3}</span>
      <span>{props.nothing + 2}</span>
      <span>{props.nothing / 2}</span>
    </p>
  )
}
`,
  props: { nothing: null },
  expectedHtml: `
    <p bf-s="test" bf="s6" data-nothing="-1" data-signal="1">
      <span bf="s1"><!--bf:s0-->0<!--/--></span>
      <span bf="s3"><!--bf:s2-->2<!--/--></span>
      <span bf="s5"><!--bf:s4-->0<!--/--></span>
    </p>
  `,
})
