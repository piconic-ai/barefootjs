import { createFixture } from '../src/types'

/**
 * A destructured array prop with its own default (`{ items: rows = [] }`,
 * `{ tags = [] }`) seeding `createSignal(rows ?? [...])`: the binding takes its
 * default before `??` / `||` reads it, so with the prop omitted the signal
 * holds the default (no rows), never the fallback.
 */
export const fixture = createFixture({
  id: 'signal-array-prop-fallback-seed-default',
  description: 'An array signal seeded with `rows ?? [...]` over a destructured prop with an empty default renders the default when the prop is omitted',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function SignalArrayPropFallbackSeedDefault({ items: rows = [], tags = [] }: { items?: { id: string }[]; tags?: { id: string }[] }) {
  const [state] = createSignal(rows ?? [{ id: 'signal' }])
  const [alt] = createSignal(tags || [{ id: 'alt' }])
  return (
    <div>
      <ul class="rows">{state().map(r => <li key={r.id}>{r.id}</li>)}</ul>
      <ul class="tags">{alt().map(r => <li key={r.id}>{r.id}</li>)}</ul>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1" class="rows"></ul>
      <ul bf="s3" class="tags"></ul>
    </div>
  `,
  dataPoints: [
    { name: 'items-given', props: { items: [{ id: 'a' }], tags: [{ id: 't' }] } },
    { name: 'items-null', props: { items: null, tags: null } },
  ],
})
