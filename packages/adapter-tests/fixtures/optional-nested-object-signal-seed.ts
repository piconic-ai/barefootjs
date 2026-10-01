import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'optional-nested-object-signal-seed',
  description: 'A signal seeded from an optional nested object retains its nullable field type',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Meta = { active: boolean }
type Row = { meta?: Meta; inline?: { active: boolean } }
export function OptionalNestedObjectSignalSeed(props: { row: Row }) {
  const [meta] = createSignal(props.row.meta)
  const [inline] = createSignal(props.row.inline)
  return <div>
    <span>{meta()?.['active'] === false ? 'false' : 'missing'}</span>
    <span>{inline()?.['active'] === false ? 'false' : 'missing'}</span>
  </div>
}
`,
  props: { row: { meta: { active: false }, inline: { active: false } } },
  dataPoints: [
    { name: 'absent', props: { row: {} } },
    { name: 'present-true', props: { row: { meta: { active: true }, inline: { active: true } } } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf-cond-start:s0-->false<!--bf-cond-end:s0--></span>
      <span bf="s3"><!--bf-cond-start:s2-->false<!--bf-cond-end:s2--></span>
    </div>
  `,
})
