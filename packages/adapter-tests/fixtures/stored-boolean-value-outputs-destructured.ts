import { createFixture } from '../src/types'

/**
 * A boolean that reaches an output through a stored value renders as the
 * same boolean read directly does (#3789): nothing as a text child, `true` /
 * `false` in an attribute, a template literal and a child's `String(v)`.
 *
 * The stored values are a memo over `props.x ?? 'x'` (the analyzer reads its
 * type off the fallback, `string`, while the value is the prop's boolean), a
 * memo of that memo, a signal seeded with it (with and without a declared
 * type), a local constant, a memo over that constant, a block-bodied memo,
 * a memo with a declared `boolean | string`, and memos over `&&`, `||`, a
 * ternary, a comparison and a boolean signal. Each is read with `false`, `true` and a string behind
 * it; the `number` memos over `??` keep printing `0` and a fraction.
 *
 * The props-object twin is `stored-boolean-value-outputs`.
 */
export const fixture = createFixture({
  id: 'stored-boolean-value-outputs-destructured',
  description: 'A boolean held by a memo, signal or local constant renders as the boolean read directly does',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
import { FlagLabel } from './flag-label'
export function StoredBooleanValueOutputsDestructured({ no, on, off, label, n, f, items }: { no?: boolean | string; on?: boolean | string; off?: boolean; label?: boolean | string; n: number; f: number; items: string[] }) {
  const [flag] = createSignal(false)
  const [seeded] = createSignal(no ?? 'x')
  const [typedSeed] = createSignal<boolean | string>(no ?? 'x')
  const local = no ?? 'x'
  const shown = createMemo(() => no ?? 'x')
  const again = createMemo(() => shown())
  const viaLocal = createMemo(() => local)
  const block = createMemo(() => { return no ?? 'x' })
  const typed = createMemo<boolean | string>(() => no ?? 'x')
  const yes = createMemo(() => on ?? 'x')
  const text = createMemo(() => label ?? 'x')
  const and = createMemo(() => off && 'y')
  const or = createMemo(() => no || 'y')
  const pick = createMemo(() => flag() ? 'a' : false)
  const big = createMemo(() => n > 1)
  const held = createMemo(() => flag())
  const count = createMemo(() => n ?? 5)
  const part = createMemo(() => f ?? 1)
  return (
    <div data-shown={shown()} data-again={again()} data-seeded={seeded()} data-local={local} data-yes={yes()} data-text={text()} data-and={and()} data-pick={pick()} data-tpl={\`v=\${shown()}\`}>
      <p>[{shown()}][{again()}][{seeded()}][{typedSeed()}][{local}][{viaLocal()}][{block()}][{typed()}]</p>
      <p>[{yes()}][{text()}][{and()}][{or()}][{pick()}][{big()}][{held()}]</p>
      <p>[{count()}][{part()}]</p>
      <p>{\`\${shown()}|\${yes()}|\${text()}\`}|{String(shown())}|{shown() ? 'T' : 'F'}</p>
      <FlagLabel value={shown()} />
      <ul>{items.map(item => <li key={item} data-v={shown()}>{item}:{shown()}:{yes()}:{text()}</li>)}</ul>
    </div>
  )
}
`,
  components: {
    './flag-label.tsx': `
export function FlagLabel({ value }: { value: boolean | string }) {
  return <i data-v={value}>{value}|{String(value)}</i>
}
`,
  },
  props: { no: false, on: true, off: false, label: 'str', n: 0, f: 0.5, items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s31" data-again="false" data-and="false" data-local="false" data-pick="false" data-seeded="false" data-shown="false" data-text="str" data-tpl="v=false" data-yes="true">
      <p bf="s8">[<!--bf:s0--><!--/-->][<!--bf:s1--><!--/-->][<!--bf:s2--><!--/-->][<!--bf:s3--><!--/-->][<!--bf:s4--><!--/-->][<!--bf:s5--><!--/-->][<!--bf:s6--><!--/-->][<!--bf:s7--><!--/-->]</p>
      <p bf="s16">[<!--bf:s9--><!--/-->][<!--bf:s10-->str<!--/-->][<!--bf:s11--><!--/-->][<!--bf:s12-->y<!--/-->][<!--bf:s13--><!--/-->][<!--bf:s14--><!--/-->][<!--bf:s15--><!--/-->]</p>
      <p bf="s19">[<!--bf:s17-->0<!--/-->][<!--bf:s18-->0.5<!--/-->]</p>
      <p bf="s23"><!--bf:s20-->false|true|str<!--/-->|<!--bf:s21-->false<!--/-->|<!--bf-cond-start:s22-->F<!--bf-cond-end:s22--></p>
      <i bf-s="test_s24" bf="s2" data-v="false"><!--bf:s0--><!--/-->|<!--bf:s1-->false<!--/--></i>
      <ul bf="s30">
        <li bf="s29" data-key="a" data-v="false"><!--bf:s25-->a<!--/-->:<!--bf:s26--><!--/-->:<!--bf:s27--><!--/-->:<!--bf:s28-->str<!--/--></li>
        <li bf="s29" data-key="b" data-v="false"><!--bf:s25-->b<!--/-->:<!--bf:s26--><!--/-->:<!--bf:s27--><!--/-->:<!--bf:s28-->str<!--/--></li>
      </ul>
    </div>
  `,
})
