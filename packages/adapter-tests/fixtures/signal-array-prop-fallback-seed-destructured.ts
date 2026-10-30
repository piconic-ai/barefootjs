import { createFixture } from '../src/types'

/**
 * An array signal seeded from an optional array prop with an array-literal
 * fallback (`items ?? [...]`). With the prop omitted (or `null`) the
 * signal holds the fallback rows; the Go template adapter used to seed the
 * bare prop field, so it rendered no rows.
 */
export const fixture = createFixture({
  id: 'signal-array-prop-fallback-seed-destructured',
  description: 'An array signal seeded with `items ?? [...]` renders the fallback rows when the prop is omitted',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

export function SignalArrayPropFallbackSeedDestructured({ items }: { items?: { id: string; n: number }[] }) {
  const [rows] = createSignal(items ?? [{ id: 'z', n: 2 }, { id: 'y', n: 0 }])
  const [alt] = createSignal(items || [{ id: 'w', n: 1 }])
  const shown = createMemo(() => rows())
  return (
    <div>
      <ul class="rows">
        {rows().map(r => <li key={r.id} data-n={r.n}>{r.id}{r.n > 1 ? '+' : '-'}</li>)}
      </ul>
      <ul class="alt">{alt().map(r => <li key={r.id}>{\`\${r.id}:\${r.n}\`}</li>)}</ul>
      <ul class="memo">{shown().map(r => <li key={r.id}>{r.n > 1 && <em>{r.id}</em>}</li>)}</ul>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s3" class="rows">
        <li bf="s2" data-key="z" data-n="2"><!--bf:s0-->z<!--/--><!--bf-cond-start:s1-->+<!--bf-cond-end:s1--></li>
        <li bf="s2" data-key="y" data-n="0"><!--bf:s0-->y<!--/--><!--bf-cond-start:s1-->-<!--bf-cond-end:s1--></li>
      </ul>
      <ul bf="s5" class="alt"><li data-key="w"><!--bf:s4-->w:1<!--/--></li></ul>
      <ul bf="s8" class="memo">
        <li data-key="z"><em bf-c="s6"><!--bf:s7-->z<!--/--></em></li>
        <li data-key="y"><!--bf-cond-start:s6--><!--bf-cond-end:s6--></li>
      </ul>
    </div>
  `,
  dataPoints: [
    { name: 'items-given', props: { items: [{ id: 'a', n: 5 }] } },
    { name: 'items-null', props: { items: null } },
    { name: 'items-empty', props: { items: [] } },
  ],
})
