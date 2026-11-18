import { createFixture } from '../src/types'

/**
 * A signal seeded with `props.x ?? <fallback>` over a mixed-union prop
 * (`string | boolean | number | null`), where the fallback is the zero
 * value of its own type (`false`, `''`, `0`): an omitted or `null` prop
 * takes the fallback, and a passed falsy value of another type is kept (the
 * passed `''` is read in an attribute only). Go
 * holds such a prop in an `interface{}` field, where an absent prop is nil,
 * not the fallback type's zero value, so the fallback is not a no-op.
 *
 * The destructured twin is `union-prop-zero-fallback-signal-seed-destructured`.
 */
export const fixture = createFixture({
  id: 'union-prop-zero-fallback-signal-seed',
  description: 'A zero-valued ?? fallback seeds a signal over an omitted or null mixed-union prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function UnionPropZeroFallbackSignalSeed(props: { a?: string | boolean | number | null; b?: string | boolean | number | null; c?: string | boolean | number | null; d?: string | boolean | number | null; e?: string | boolean | number | null; f?: string | boolean | number | null; g?: string | boolean | number | null; h?: string | boolean | number | null; i?: string | boolean | number | null; j?: string | boolean | number | null }) {
  const [av] = createSignal(props.a ?? false)
  const [bv] = createSignal(props.b ?? false)
  const [cv] = createSignal(props.c ?? false)
  const [dv] = createSignal(props.d ?? '')
  const [ev] = createSignal(props.e ?? '')
  const [fv] = createSignal(props.f ?? '')
  const [gv] = createSignal(props.g ?? 0)
  const [hv] = createSignal(props.h ?? 0)
  const [iv] = createSignal(props.i ?? 0)
  const [jv] = createSignal(props.j ?? 0)
  return <p data-j={jv()} data-a={av()} data-b={bv()} data-c={cv()} data-d={dv()} data-e={ev()} data-f={fv()} data-g={gv()} data-h={hv()} data-i={iv()}>{String(av())}|{String(bv())}|{String(cv())}|{String(dv())}|{String(ev())}|{String(fv())}|{String(gv())}|{String(hv())}|{String(iv())}</p>
}
`,
  props: { b: null, c: 0, e: null, f: false, h: null, i: false, j: '' },
  expectedHtml: `
    <p bf-s="test" bf="s9" data-a="false" data-b="false" data-c="0" data-d="" data-e="" data-f="false" data-g="0" data-h="0" data-i="false" data-j=""><!--bf:s0-->false<!--/-->|<!--bf:s1-->false<!--/-->|<!--bf:s2-->0<!--/-->|<!--bf:s3--><!--/-->|<!--bf:s4--><!--/-->|<!--bf:s5-->false<!--/-->|<!--bf:s6-->0<!--/-->|<!--bf:s7-->0<!--/-->|<!--bf:s8-->false<!--/--></p>
  `,
})
