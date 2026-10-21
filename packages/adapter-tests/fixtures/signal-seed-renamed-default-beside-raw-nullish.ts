import { createFixture } from '../src/types'

/**
 * A signal seeded from a renamed body-destructure default
 * (`const { b: local = 'x' } = props; createSignal(local)`) beside raw reads
 * of the same prop: a signal seeded by `props.b ?? 'raw-missing'`, a
 * template `props.b ?? 'tpl-missing'` and a bare `props.b`. Each read keeps
 * its own fallback when `b` is omitted: the seeds start at `'raw-missing'`
 * and `'x'`, the template read renders `'tpl-missing'`, and the bare read
 * omits its attribute.
 */
export const fixture = createFixture({
  id: 'signal-seed-renamed-default-beside-raw-nullish',
  description: 'a signal seeded by a renamed body default keeps its own default beside raw `props.b ?? d` reads (#3577)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function SignalSeedRenamedDefaultBesideRawNullish(props: { b?: string }) {
  const { b: local = 'x' } = props
  const [r] = createSignal(props.b ?? 'raw-missing')
  const [s] = createSignal(local)
  return (
    <p data-r={r()} data-s={s()} data-tpl={props.b ?? 'tpl-missing'} data-bare={props.b}>
      <span>{s()}</span>
    </p>
  )
}
`,
  props: { b: 'B' },
  expectedHtml: `
    <p bf-s="test" bf="s2" data-bare="B" data-r="B" data-s="B" data-tpl="B"><span bf="s1"><!--bf:s0-->B<!--/--></span></p>
  `,
  dataPoints: [
    { name: 'b-omitted', props: {} },
    { name: 'b-null', props: { b: null } },
    { name: 'b-empty', props: { b: '' } },
  ],
})
