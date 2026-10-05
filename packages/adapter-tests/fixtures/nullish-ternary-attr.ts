import { createFixture } from '../src/types'

/**
 * Sibling of the shared `nullish-signal-attr` (#3304): an attribute bound
 * to a ternary is omitted when the taken branch is `undefined` — a nullable
 * signal read, not a literal `undefined` — and rendered for a present
 * branch, including `''` and `0` (#3322). A `false` branch is
 * `nullish-ternary-false-branch-attr`.
 */
export const fixture = createFixture({
  id: 'nullish-ternary-attr',
  description: 'An attribute bound to a ternary is omitted when the taken branch is nullish and rendered for present or falsy values',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function NullishTernaryAttr() {
  const [s] = createSignal<string | undefined>(undefined)
  const [yes] = createSignal(true)
  const [no] = createSignal(false)
  return (
    <div>
      <p className="nullish" data-choice={yes() ? s() : 'present'}>a</p>
      <p className="present" data-choice={no() ? s() : 'present'}>b</p>
      <p className="empty" data-choice={yes() ? '' : s()}>c</p>
      <p className="zero" data-choice={yes() ? 0 : s()}>d</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" class="nullish">a</p>
      <p bf="s1" class="present" data-choice="present">b</p>
      <p bf="s2" class="empty" data-choice="">c</p>
      <p bf="s3" class="zero" data-choice="0">d</p>
    </div>
  `,
})
