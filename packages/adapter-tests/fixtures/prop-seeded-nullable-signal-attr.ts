import { createFixture } from '../src/types'

/**
 * A nullable signal seeded from an optional prop keeps the prop's absence:
 * an omitted prop leaves the signal `undefined`, so its attribute is
 * omitted, while a supplied `''` / `0` still renders (#3323).
 */
export const fixture = createFixture({
  id: 'prop-seeded-nullable-signal-attr',
  description: 'An attribute bound to a nullable signal seeded from an optional prop is omitted when the prop is absent and rendered for a supplied empty or zero value',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function PropSeededNullableSignalAttr(props: { absent?: string; empty?: string; none?: number; zero?: number }) {
  const [a] = createSignal<string | undefined>(props.absent)
  const [e] = createSignal<string | undefined>(props.empty)
  const [n] = createSignal<number | undefined>(props.none)
  const [z] = createSignal<number | undefined>(props.zero)
  return (
    <div>
      <p className="absent" title={a()}>a</p>
      <p className="empty" title={e()}>b</p>
      <p className="none" data-n={n()}>c</p>
      <p className="zero" data-n={z()}>d</p>
    </div>
  )
}
`,
  props: { empty: '', zero: 0 },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" class="absent">a</p>
      <p bf="s1" class="empty" title="">b</p>
      <p bf="s2" class="none">c</p>
      <p bf="s3" class="zero" data-n="0">d</p>
    </div>
  `,
})
