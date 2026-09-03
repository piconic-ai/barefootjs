import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `signal-object-spread-init` (#2700). Wrapping both
 * SSR reads of the derived signal defers them to client-only evaluation, so
 * the Go template adapter never needs to bake the object literal into Go
 * source at all — verified to compile clean and render correctly on real Go
 * (no `.Merged` field read anywhere in the emitted template), unlike the
 * un-escaped fixture this twins, which the adapter now refuses loudly with
 * BF101 (`conformance-pins.ts`) instead of silently seeding a Go zero value.
 */
export const fixture = createFixture({
  id: 'signal-object-spread-init-client',
  description: 'Signal initializer spreads a prop-derived object, reads deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: string; done: boolean }

export function SignalObjectSpreadInitClient({ base }: { base: Item }) {
  const [merged] = createSignal({ ...base, done: true })
  return (
    <div>
      <span>{/* @client */ merged().id}</span>
      <span>{/* @client */ merged().done ? 'yes' : 'no'}</span>
    </div>
  )
}
`,
  props: { base: { id: 'row-1', done: false } },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"></span>
      <span bf="s3"><!--bf-cond-start:s2--><!--bf-cond-end:s2--></span>
    </div>
  `,
})
