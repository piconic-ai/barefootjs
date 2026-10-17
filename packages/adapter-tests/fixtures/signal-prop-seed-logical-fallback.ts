import { createFixture } from '../src/types'

/**
 * Signals seeded from a prop under a `||` / `&&` (`createSignal(props.label
 * || 'none')`, `createSignal(props.flag && 'on')`). The client JS decided the
 * seed by text: anything starting with `props.` and containing no `??` got
 * ` ?? <default>` appended after the whole initializer, so `_p.label ||
 * 'none' ?? undefined` failed to parse and the client module did not load.
 * The seed is now the analyzer's `SignalInfo.propSeed` (#3508).
 */
export const fixture = createFixture({
  id: 'signal-prop-seed-logical-fallback',
  description: 'a signal seeded by `props.x || d` / `props.x && v` keeps its initializer as written on CSR (#3508)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function SeedFallback(props: { label?: string; flag?: boolean }) {
  const [text] = createSignal(props.label || 'none')
  const [mark] = createSignal(props.flag && 'on')
  return <p title={text()}>{mark() ? 'marked' : 'plain'}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1" title="none"><!--bf-cond-start:s0-->plain<!--bf-cond-end:s0--></p>
  `,
})
