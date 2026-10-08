import { createFixture } from '../src/types'

/**
 * Companion of `nullish-ternary-false-branch-attr` (#3349): a non-boolean
 * attribute bound to a ternary whose taken branch is boolean renders JS
 * `String(boolean)` when the other branch is a string, a comparison, an
 * omitting `undefined`, or a nested ternary — and an ARIA boolean name,
 * whose whole value goes through `bool_str`, keeps a taken `false` false.
 */
export const fixture = createFixture({
  id: 'ternary-boolean-branch-attr',
  description: 'A ternary attribute renders a taken boolean branch as "true" / "false" next to a non-boolean branch',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function TernaryBooleanBranchAttr() {
  const [yes] = createSignal(true)
  const [no] = createSignal(false)
  const [n] = createSignal(1)
  const [s] = createSignal<boolean | undefined>(undefined)
  return (
    <div>
      <p className="literal" data-a={yes() ? false : 'x'}>a</p>
      <p className="alternate" data-b={no() ? 'x' : true}>b</p>
      <p className="compare" data-c={yes() ? n() > 0 : 'x'}>c</p>
      <p className="omit" data-d={yes() ? false : undefined}>d</p>
      <p className="nested" data-e={yes() ? (no() ? 'x' : false) : 'y'}>e</p>
      <p className="aria" aria-hidden={yes() ? false : no()}>f</p>
      <p className="aria-nullable" aria-checked={yes() ? false : s()}>g</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" class="literal" data-a="false">a</p>
      <p bf="s1" class="alternate" data-b="true">b</p>
      <p bf="s2" class="compare" data-c="true">c</p>
      <p bf="s3" class="omit" data-d="false">d</p>
      <p bf="s4" class="nested" data-e="false">e</p>
      <p aria-hidden="false" bf="s5" class="aria">f</p>
      <p aria-checked="false" bf="s6" class="aria-nullable">g</p>
    </div>
  `,
})
