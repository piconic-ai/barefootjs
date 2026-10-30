import { createFixture } from '../src/types'

/**
 * Array signals whose rows the Go template adapter has to give a Go struct
 * to bake the seed: an inline element type, an untyped module const, and
 * untyped rows holding a scalar array. Each used to seed a `nil` field, so
 * every loop over it rendered no rows. An identity memo (and a memo of it)
 * over the signal reads the same rows; over a named row type it used to seed
 * `0` into the memo's slice field and fail the Go build.
 */
export const fixture = createFixture({
  id: 'signal-array-seed-row-struct',
  description: 'An array signal seeded with an inline-typed, module-const or nested-scalar-array literal renders its rows, also through an identity memo',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
import { Chip } from './chip'

const SEED = [{ id: 'm1', n: 1.5 }, { id: 'm2', n: 3 }]

interface Row {
  id: string
}

export function SignalArraySeedRowStruct() {
  const [inline] = createSignal<{ id: string; n: number }[]>([{ id: 'i1', n: 0 }, { id: 'i2', n: 2 }])
  const [fromConst] = createSignal(SEED)
  const [tagged] = createSignal([{ id: 't1', tags: ['a', 'b'] }, { id: 't2', tags: [] }])
  const shown = createMemo(() => fromConst())
  const shownAgain = createMemo(() => shown())
  const inlineMemo = createMemo(() => inline())
  const [named] = createSignal<Row[]>([{ id: 'r1' }, { id: 'r2' }])
  const namedMemo = createMemo(() => named())
  return (
    <div>
      <ul class="inline">
        {inline().map(r => (
          <li key={r.id} data-n={r.n} class={\`row-\${r.id}\`}>
            {r.id + ':' + r.n}
            {r.n > 1 ? 'big' : 'small'}
            {r.n > 1 && <em>hi</em>}
          </li>
        ))}
      </ul>
      <ul class="const">
        {fromConst().map(r => <li key={r.id} data-n={r.n}>{\`\${r.id}=\${r.n}\`}</li>)}
      </ul>
      <ul class="tagged">
        {tagged().map(r => (
          <li key={r.id} data-count={r.tags.length}>
            {r.id}
            {r.tags.map(t => <b key={t}>{t}</b>)}
          </li>
        ))}
      </ul>
      <ul class="memo">{shownAgain().map(r => <li key={r.id}>{r.id}</li>)}</ul>
      <ol>{namedMemo().map(r => <li key={r.id}>{r.id}</li>)}</ol>
      <p class="chips">{inlineMemo().map(r => <Chip key={r.id} label={r.id} />)}</p>
    </div>
  )
}
`,
  components: {
    './chip.tsx': `
export function Chip({ label }: { label: string }) {
  return <span>{label}</span>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s4" class="inline">
        <li bf="s3" class="row-i1" data-key="i1" data-n="0"><!--bf:s0-->i1:0<!--/--><!--bf-cond-start:s1-->small<!--bf-cond-end:s1--><!--bf-cond-start:s2--><!--bf-cond-end:s2--></li>
        <li bf="s3" class="row-i2" data-key="i2" data-n="2"><!--bf:s0-->i2:2<!--/--><!--bf-cond-start:s1-->big<!--bf-cond-end:s1--><em bf-c="s2">hi</em></li>
      </ul>
      <ul bf="s7" class="const">
        <li bf="s6" data-key="m1" data-n="1.5"><!--bf:s5-->m1=1.5<!--/--></li>
        <li bf="s6" data-key="m2" data-n="3"><!--bf:s5-->m2=3<!--/--></li>
      </ul>
      <ul bf="s11" class="tagged">
        <li bf="s10" data-count="2" data-key="t1">
          <!--bf:s8-->t1<!--/-->
          <b data-key-1="a"><!--bf:s9-->a<!--/--></b>
          <b data-key-1="b"><!--bf:s9-->b<!--/--></b>
        </li>
        <li bf="s10" data-count="0" data-key="t2"><!--bf:s8-->t2<!--/--></li>
      </ul>
      <ul bf="s13" class="memo">
        <li data-key="m1"><!--bf:s12-->m1<!--/--></li>
        <li data-key="m2"><!--bf:s12-->m2<!--/--></li>
      </ul>
      <ol bf="s15">
        <li data-key="r1"><!--bf:s14-->r1<!--/--></li>
        <li data-key="r2"><!--bf:s14-->r2<!--/--></li>
      </ol>
      <p bf="s17" class="chips">
        <span bf-s="Chip_*" bf="s1" data-key="i1"><!--bf:s0-->i1<!--/--></span>
        <span bf-s="Chip_*" bf="s1" data-key="i2"><!--bf:s0-->i2<!--/--></span>
      </p>
    </div>
  `,
})
