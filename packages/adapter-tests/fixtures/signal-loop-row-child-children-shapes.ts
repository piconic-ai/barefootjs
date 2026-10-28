import { createFixture } from '../src/types'

/**
 * Sibling shapes of `signal-loop-row-child-children`: a loop over a signal
 * array whose row is a child component with forwarded JSX children, where
 * the signal is seeded from a destructured array prop of objects and of
 * strings, is a scalar literal array read by row and index, is reached
 * through a local alias of its getter, or is filtered, and where the
 * forwarded children are static text or static elements (also on a
 * module-const array). The props-object twin is
 * `signal-loop-row-child-children-props-object`.
 */
export const fixture = createFixture({
  id: 'signal-loop-row-child-children-shapes',
  description:
    "Signal-array loops whose row is a child component with forwarded JSX children render each row at SSR, whatever seeds the signal and whatever the children read",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip({ children, tone }: { children?: any; tone?: string }) {
  return <span class="chip" data-tone={tone}>{children}</span>
}

const FIXED = [{ id: 'm' }, { id: 'n' }]

export function SignalLoopRowChildChildrenShapes({ items, tags }: { items: { id: string; shade: string }[]; tags: string[] }) {
  const [rows] = createSignal(items)
  const [labels] = createSignal(tags)
  const [letters] = createSignal(['x', 'y'])
  const [flags] = createSignal([{ id: 'f1', on: true }, { id: 'f2', on: false }, { id: 'f3', on: true }])
  const alias = rows
  return (
    <div>
      <p class="prop-rows">{rows().map((o) => <Chip key={o.id} tone={o.shade}><b>{o.id}</b></Chip>)}</p>
      <p class="prop-scalars">{labels().map((t) => <Chip key={t}><i>{t}</i></Chip>)}</p>
      <p class="literal-scalars">{letters().map((s, i) => <Chip key={s}>{s}-{i}</Chip>)}</p>
      <p class="index-key">{letters().map((s, i) => <Chip key={i}><u>{s}</u></Chip>)}</p>
      <p class="alias">{alias().map((o) => <Chip key={o.id}>{\`\${o.id}!\`}</Chip>)}</p>
      <p class="filtered">{flags().filter((f) => f.on).map((f) => <Chip key={f.id}><em>{f.id}</em></Chip>)}</p>
      <p class="static-text">{rows().map((o) => <Chip key={o.id}>fixed</Chip>)}</p>
      <p class="static-element">{rows().map((o) => <Chip key={o.id}><s>fixed</s></Chip>)}</p>
      <p class="const-static">{FIXED.map((o) => <Chip key={o.id}><s>fixed</s></Chip>)}</p>
    </div>
  )
}
`,
  props: {
    items: [
      { id: 'a', shade: 'red' },
      { id: 'b', shade: 'blue' },
    ],
    tags: ['t1', 't2'],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2" class="prop-rows">
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="a" data-tone="red"><b><!--bf:^s0-->a<!--/--></b></span>
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="b" data-tone="blue"><b><!--bf:^s0-->b<!--/--></b></span>
      </p>
      <p bf="s5" class="prop-scalars">
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="t1"><i><!--bf:^s3-->t1<!--/--></i></span>
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="t2"><i><!--bf:^s3-->t2<!--/--></i></span>
      </p>
      <p bf="s9" class="literal-scalars">
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="x"><!--bf:^s6-->x<!--/-->-<!--bf:^s7-->0<!--/--></span>
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="y"><!--bf:^s6-->y<!--/-->-<!--bf:^s7-->1<!--/--></span>
      </p>
      <p bf="s12" class="index-key">
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="0"><u><!--bf:^s10-->x<!--/--></u></span>
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="1"><u><!--bf:^s10-->y<!--/--></u></span>
      </p>
      <p bf="s15" class="alias">
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="a"><!--bf:^s13-->a!<!--/--></span>
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="b"><!--bf:^s13-->b!<!--/--></span>
      </p>
      <p bf="s18" class="filtered">
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="f1"><em><!--bf:^s16-->f1<!--/--></em></span>
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="f3"><em><!--bf:^s16-->f3<!--/--></em></span>
      </p>
      <p bf="s20" class="static-text">
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="a">fixed</span>
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="b">fixed</span>
      </p>
      <p bf="s22" class="static-element">
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="a"><s>fixed</s></span>
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="b"><s>fixed</s></span>
      </p>
      <p bf="s24" class="const-static">
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="m"><s>fixed</s></span>
        <span bf-s="Chip_*" bf="s0" class="chip" data-key="n"><s>fixed</s></span>
      </p>
    </div>
  `,
})
