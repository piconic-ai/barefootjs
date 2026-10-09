import { createFixture } from '../src/types'

/**
 * Sibling of `member-seeded-nullable-signal-attr` (#3323) with the object
 * prop typed inline (`{ initial: { label?: string } }`) instead of through a
 * named type: the anonymous object's generated struct must keep an absent
 * member's absence the same way.
 */
export const fixture = createFixture({
  id: 'member-seeded-nullable-signal-attr-inline',
  description: 'An attribute bound to a nullable signal seeded from an optional member of an inline-typed required object prop is omitted when the member is absent and rendered for a supplied empty or zero value',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function MemberSeededNullableSignalAttrInline(
  { initial, given }: { initial: { label?: string; count?: number }; given: { label?: string; count?: number } }
) {
  const [a] = createSignal<string | undefined>(initial.label)
  const [n] = createSignal<number | undefined>(initial.count)
  const [e] = createSignal<string | undefined>(given.label)
  const [z] = createSignal<number | undefined>(given.count)
  return (
    <div>
      <p className="absent" title={a()}>a</p>
      <p className="none" data-n={n()}>b</p>
      <p className="empty" title={e()}>c</p>
      <p className="zero" data-n={z()}>d</p>
    </div>
  )
}
`,
  props: { initial: {}, given: { label: '', count: 0 } },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" class="absent">a</p>
      <p bf="s1" class="none">b</p>
      <p bf="s2" class="empty" title="">c</p>
      <p bf="s3" class="zero" data-n="0">d</p>
    </div>
  `,
})
