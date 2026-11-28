import { createFixture } from '../src/types'

/**
 * A same-named memo or signal whose `??` fallback is another prop
 * (`props.label ?? props.other`): with its own prop absent it renders the
 * other prop's value, never empty.
 */
export const fixture = createFixture({
  id: 'memo-same-named-prop-fallback',
  description: 'A same-named memo or signal falling back to another prop renders that prop when its own is absent',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function MemoSameNamedPropFallback(props: { label?: string; other?: string; title?: string; alt?: string }) {
  const label = createMemo(() => props.label ?? props.other)
  const [title] = createSignal(props.title ?? props.alt)
  return <p data-label={label()}>{label()}|{title()}</p>
}
`,
  props: { other: 'yes', alt: 'alt' },
  expectedHtml: `
    <p bf-s="test" bf="s2" data-label="yes"><!--bf:s0-->yes<!--/-->|<!--bf:s1-->alt<!--/--></p>
  `,
  dataPoints: [
    { name: 'own', props: { label: 'mine', other: 'yes', title: 'T', alt: 'alt' } },
  ],
})
