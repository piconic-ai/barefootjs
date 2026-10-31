import { createFixture } from '../src/types'

/**
 * A JS boolean value in every position it can reach (#3824 step 5, #3808,
 * #3789):
 *
 * - a comparison and a boolean literal passed to a child that prints its
 *   `boolean` prop with `String(v)`, tests it with `v ? 'y' : 'n'` and
 *   renders it as a text child, and to a child whose `unknown` prop is
 *   printed by a template literal and `JSON.stringify` (#3808);
 * - a signal seed, a memo and a local constant holding a comparison;
 * - `JSON.stringify([n, true])`, and a ternary branch, a comparison and `!`
 *   nested in a `JSON.stringify` array;
 * - `&&` / `||` results in an attribute, through `String()` and as a text
 *   child;
 * - a bare `{true}` / `{false}` / `{cond}` text child, which renders nothing;
 * - an attribute `data-x={cond}`, a template literal, a string
 *   concatenation and a loop row.
 *
 * Every position prints JS's `true` / `false`, never Perl's `1` / `''` /
 * `0`. The destructured twin is `boolean-value-positions-destructured`.
 */
export const fixture = createFixture({
  id: 'boolean-value-positions',
  description: 'A boolean value prints true / false in every position it reaches',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
import { BoolLabel } from './bool-label'
import { ValueLabel } from './value-label'
export function BooleanValuePositions(props: { n: number; on: boolean; items: number[] }) {
  const [seeded] = createSignal(props.n > 1)
  const big = createMemo(() => props.n > 1)
  const small = props.n < 1
  return (
    <div data-x={props.n > 1} data-and={props.on && props.n > 1} data-or={props.n > 5 || props.on} data-tpl={\`t=\${props.n > 1}\`}>
      <BoolLabel value={props.n > 1} />
      <BoolLabel value={true} />
      <BoolLabel value={false} />
      <BoolLabel value={props.on && props.n === 1} />
      <ValueLabel value={props.n === 2} />
      <ValueLabel value={props.on && props.n === 1} />
      <span>{String(seeded())}|{String(big())}|{String(small)}</span>
      <span>{seeded() ? 'y' : 'n'}|{big() ? 'y' : 'n'}|{small ? 'y' : 'n'}</span>
      <span>{JSON.stringify([props.n, true])}</span>
      <span>{JSON.stringify([props.on ? props.n > 1 : 'x', [props.n === 2, !props.on]])}</span>
      <span>{String(props.on && props.n > 1)}|{String(props.n > 5 || props.on)}|{String(props.n > 5 || props.n < 1)}</span>
      <span>{props.on && props.n > 1}|{props.n > 5 || props.n < 1}</span>
      <span>{true}|{false}|{props.n > 1}|{props.on}|{seeded()}|{big()}|{small}</span>
      <span>{\`t=\${props.n > 1}|\${props.n < 1}\`}</span>
      <span>{'c=' + (props.n > 1)}</span>
      <ul>{props.items.map(i => <li key={i} data-v={i > 1}>{String(i > 1)}:{i > 1}<BoolLabel value={i > props.n} /></li>)}</ul>
    </div>
  )
}
`,
  components: {
    './bool-label.tsx': `
export function BoolLabel(props: { value: boolean }) {
  return <i data-v={String(props.value)}>{String(props.value)}|{props.value ? 'y' : 'n'}|{props.value}</i>
}
`,
    './value-label.tsx': `
export function ValueLabel(props: { value: unknown }) {
  return <b data-v={\`\${props.value}\`}>{\`\${props.value}\`}|{JSON.stringify(props.value)}</b>
}
`,
  },
  props: { n: 2, on: true, items: [1, 3] },
  expectedHtml: `
    <div bf-s="test" bf="s44" data-and="true" data-or="true" data-tpl="t=true" data-x="true">
      <i bf-s="test_s0" bf="s3" data-v="true"><!--bf:s0-->true<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1-->|<!--bf:s2--><!--/--></i>
      <i bf-s="test_s1" bf="s3" data-v="true"><!--bf:s0-->true<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1-->|<!--bf:s2--><!--/--></i>
      <i bf-s="test_s2" bf="s3" data-v="false"><!--bf:s0-->false<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf:s2--><!--/--></i>
      <i bf-s="test_s3" bf="s3" data-v="false"><!--bf:s0-->false<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf:s2--><!--/--></i>
      <b bf-s="test_s4" bf="s2" data-v="true"><!--bf:s0-->true<!--/-->|<!--bf:s1-->true<!--/--></b>
      <b bf-s="test_s5" bf="s2" data-v="false"><!--bf:s0-->false<!--/-->|<!--bf:s1-->false<!--/--></b>
      <span bf="s9"><!--bf:s6-->true<!--/-->|<!--bf:s7-->true<!--/-->|<!--bf:s8-->false<!--/--></span>
      <span bf="s16"><!--bf-cond-start:s10-->y<!--bf-cond-end:s10-->|<!--bf-cond-start:s12-->y<!--bf-cond-end:s12-->|<!--bf-cond-start:s14--><!--bf:s15-->n<!--/--><!--bf-cond-end:s14--></span>
      <span bf="s18"><!--bf:s17-->[2,true]<!--/--></span>
      <span bf="s20"><!--bf:s19-->[true,[true,false]]<!--/--></span>
      <span bf="s24"><!--bf:s21-->true<!--/-->|<!--bf:s22-->true<!--/-->|<!--bf:s23-->false<!--/--></span>
      <span bf="s28"><!--bf-cond-start:s25--><!--bf:s26--><!--/--><!--bf-cond-end:s25-->|<!--bf:s27--><!--/--></span>
      <span bf="s34">||<!--bf:s29--><!--/-->|<!--bf:s30--><!--/-->|<!--bf:s31--><!--/-->|<!--bf:s32--><!--/-->|<!--bf:s33--><!--/--></span>
      <span bf="s36"><!--bf:s35-->t=true|false<!--/--></span>
      <span bf="s38"><!--bf:s37-->c=true<!--/--></span>
      <ul bf="s43">
        <li bf="s42" data-key="1" data-v="false"><!--bf:s39-->false<!--/-->:<!--bf:s40--><!--/--><i bf-s="test_s41" bf="s3" data-v="false"><!--bf:s0-->false<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf:s2--><!--/--></i></li>
        <li bf="s42" data-key="3" data-v="true"><!--bf:s39-->true<!--/-->:<!--bf:s40--><!--/--><i bf-s="test_s41" bf="s3" data-v="true"><!--bf:s0-->true<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1-->|<!--bf:s2--><!--/--></i></li>
      </ul>
    </div>
  `,
})
