import { createFixture } from '../src/types'

/**
 * A zero-arg call on a JavaScript global (`Date.UTC()`), in an attribute,
 * through a computed const read in text, and through a computed member
 * (`Date[props.method]()`). A template has no binding for the
 * global, so every template adapter used to read the call as a member value
 * (`Date['UTC']`, `.Date.UTC`) and render empty. Each now refuses with
 * BF101, as a method call with arguments outside the catalogue already did
 * (#3505). `Date.UTC()` stands in for `Date.now()` / `Math.random()`, whose
 * results no fixture can pin.
 */
export const fixture = createFixture({
  id: 'unlowered-global-call',
  description: 'A zero-arg call on a JavaScript global refuses (BF101) instead of rendering a member read (#3505)',
  escapes: [
    { kind: 'prop-precompute', fixture: 'unlowered-global-call-precomputed' },
    { kind: 'client-directive', fixture: 'unlowered-global-call-client' },
  ],
  source: `
'use client'

export function GlobalCall(props: { method: 'UTC' | 'parse' }) {
  const stamp = Date.UTC()
  return <p title={Date.UTC()} data-computed={Date[props.method]()}>{stamp}</p>
}
`,
  props: { method: 'UTC' },
  expectedHtml: `
    <p bf-s="test" bf="s0" data-computed="NaN" title="NaN">NaN</p>
  `,
})
