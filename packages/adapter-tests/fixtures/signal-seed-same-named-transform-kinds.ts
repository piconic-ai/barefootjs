import { createFixture } from '../src/types'

/**
 * `signal-seed-same-named-transform` across the transform kinds: each
 * signal is seeded by transforming the prop it shares a name with (a
 * template literal, a ternary, arithmetic, a method call, `||` with a
 * concatenation), beside a bare `||` fallback and a differently named
 * signal seeded the same way. Each signal renders its transformed value,
 * in text and in an attribute.
 */
export const fixture = createFixture({
  id: 'signal-seed-same-named-transform-kinds',
  description: 'Signals seeded by transforming their same-named props keep each transformation',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalSeedSameNamedTransformKinds(props: {
  tpl?: string; tern?: string; num?: number; up?: string; oc?: string; fb?: string; src?: string
}) {
  const [tpl] = createSignal(\`\${props.tpl ?? 'none'}!\`)
  const [tern] = createSignal(props.tern ? 'yes' : 'no')
  const [num] = createSignal((props.num ?? 1) + 10)
  const [up] = createSignal((props.up ?? 'none').toUpperCase())
  const [oc] = createSignal((props.oc || 'x') + '?')
  const [fb] = createSignal(props.fb || 'fallback')
  const [other] = createSignal(String(props.src ?? 'none') + '!')
  return (
    <p data-tpl={tpl()} data-num={num()}>
      {tpl()}|{tern()}|{num()}|{up()}|{oc()}|{fb()}|{other()}
    </p>
  )
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s7" data-num="11" data-tpl="none!"><!--bf:s0-->none!<!--/-->|<!--bf:s1-->no<!--/-->|<!--bf:s2-->11<!--/-->|<!--bf:s3-->NONE<!--/-->|<!--bf:s4-->x?<!--/-->|<!--bf:s5-->fallback<!--/-->|<!--bf:s6-->none!<!--/--></p>
  `,
  dataPoints: [
    { name: 'supplied', props: { tpl: 'a', tern: 't', num: 5, up: 'abc', oc: 'o', fb: 'f', src: 's' } },
    { name: 'empty', props: { tpl: '', tern: '', num: 0, up: '', oc: '', fb: '', src: '' } },
  ],
})
