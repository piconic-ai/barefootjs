import { createFixture } from '../src/types'

/**
 * #2873: `%` (modulo) inside a ternary CONDITION (a class attribute here).
 *
 * `renderConditionExpr`'s binary-operator switch had no `%` case — unlike
 * the general (non-condition) binary emitter, which already lowers `%` to
 * `bf_mod` — so the `default` arm emitted a literal ` % ` into the
 * generated Go template text. `html/template` can't parse that: real
 * `go run` panicked with `unexpected "%" in operand` instead of rendering.
 */
export const fixture = createFixture({
  id: 'conditional-class-modulo',
  description: 'Modulo in a ternary condition position (class attribute) (#2873)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ConditionalClassModulo() {
  const [n, setN] = createSignal(3)
  return <div class={n() % 2 === 0 ? 'even' : 'odd'}>{n()}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1" class="odd"><!--bf:s0-->3<!--/--></div>
  `,
})
