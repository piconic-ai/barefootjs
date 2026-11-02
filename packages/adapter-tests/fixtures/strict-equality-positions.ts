import { createFixture } from '../src/types'

/**
 * JS `===` / `!==` at every position that reads a strict equality (#3769,
 * #3824 step 8): same type and same value, no coercion. Two numbers compare
 * by value (`0 === -0` holds, `NaN !== NaN`), as do two strings and two
 * booleans; operands of different types are never equal (`1 !== '1'`,
 * `true !== 1`, a string prop holding `'1'` against the literal `1`); a nil
 * equals only a nil, so an omitted optional number and a `null` one both
 * differ from `0` and `1`. An element read the compiler cannot type
 * (`.at()` over a signal seeded with `['abc']`) compares through the
 * runtime's `strict_eq`.
 *
 * Covered: an attribute (a boolean value, and a ternary over a comparison),
 * text (`JSON.stringify` of comparison values), a ternary test, a JSX
 * conditional, a memo body, a loop row, a `.filter()` predicate (string ×
 * string, number × number and number × string), and a comparison passed as
 * a child prop.
 */
export const fixture = createFixture({
  id: 'strict-equality-positions',
  description: 'Every strict-equality position gives the JS answer for number, string, boolean, mixed, NaN, -0 and nil operands',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

function Flag(props: { label: string; on: boolean }) {
  return <b data-label={props.label}>{props.on ? 'T' : 'F'}</b>
}

export function StrictEqualityPositions(props: {
  n: number
  m: number
  k: number
  s: string
  t: string
  u: string
  yes: boolean
  no: boolean
  digits: string
  zero: number
  nul: number | null
  maybe?: number
  nums: number[]
  words: string[]
}) {
  const [items] = createSignal(['abc'])
  const sameStr = createMemo(() => (props.s === props.t))
  const mixed = createMemo(() => (props.digits === 1))
  const nan = createMemo(() => ((props.zero / props.zero) === (props.zero / props.zero)))
  return (
    <div data-num={(props.n === props.m)} data-mixed={(props.digits !== 1)} data-str={(props.s === props.u) ? 'eq' : 'ne'} data-nil={(props.maybe === 0) ? 'eq' : 'ne'}>
      <span>{JSON.stringify([(props.n === props.m), (props.n !== props.k), (props.s === props.t), (props.s === props.u), (props.yes === props.no), (props.yes !== props.no)])}</span>
      <span>{JSON.stringify([(props.n === props.s), (props.yes === props.n), (props.digits === 1), (props.digits !== 1), (props.digits === props.s)])}</span>
      <span>{JSON.stringify([((props.zero / props.zero) === (props.zero / props.zero)), ((props.zero / props.zero) !== (props.zero / props.zero)), (props.zero === -0), (-props.zero === props.zero)])}</span>
      <span>{JSON.stringify([(props.maybe === 0), (props.maybe !== 1), (props.nul === 0), (props.nul !== 0), (items().at(0) === 0), (items().at(0) === 'abc')])}</span>
      <span>{(props.n === props.m) ? 'T' : 'F'}|{(props.s !== props.t) ? 'T' : 'F'}|{(props.yes === props.no) ? 'T' : 'F'}|{(props.digits === 1) ? 'T' : 'F'}|{(props.maybe === 1) ? 'T' : 'F'}|{(props.nul !== 0) ? 'T' : 'F'}</span>
      {(props.n === props.m) ? <b>if-numbers</b> : <i>if-not-numbers</i>}
      {(props.digits === 1) ? <b>if-mixed</b> : <i>if-not-mixed</i>}
      {(props.maybe === 0) ? <b>if-nil</b> : <i>if-not-nil</i>}
      <span>{sameStr() ? 'T' : 'F'}|{mixed() ? 'T' : 'F'}|{nan() ? 'T' : 'F'}</span>
      <ul>{props.nums.map(x => <li key={x} data-eq={(x === props.n) ? 'y' : 'n'}>{x}:{(x !== props.k) ? 'ne' : 'eq'}:{(x === props.s) ? 'same' : 'differ'}</li>)}</ul>
      <ol>{props.words.filter(w => (w === props.s)).map(w => <li key={w}>{w}</li>)}</ol>
      <ol>{props.nums.filter(x => (x !== props.n)).map(x => <li key={x}>{x}</li>)}</ol>
      <ol>{props.nums.filter(x => (x === props.digits)).map(x => <li key={x}>{x}</li>)}</ol>
      <Flag label="numbers" on={(props.n === props.m)} />
      <Flag label="mixed" on={(props.digits === 1)} />
      <Flag label="nil" on={(props.nul === 0)} />
    </div>
  )
}
`,
  props: {
    n: 1,
    m: 1,
    k: 2,
    s: 'a',
    t: 'a',
    u: 'b',
    yes: true,
    no: false,
    digits: '1',
    zero: 0,
    nul: null,
    nums: [1, 2, 3],
    words: ['a', 'b', 'c'],
  },
  expectedHtml: `
    <div bf-s="test" bf="s36" data-mixed="true" data-nil="ne" data-num="true" data-str="ne">
      <span bf="s1"><!--bf:s0-->[true,true,true,false,false,true]<!--/--></span>
      <span bf="s3"><!--bf:s2-->[false,false,false,true,false]<!--/--></span>
      <span bf="s5"><!--bf:s4-->[false,true,true,true]<!--/--></span>
      <span bf="s7"><!--bf:s6-->[false,true,false,true,false,true]<!--/--></span>
      <span bf="s14"><!--bf-cond-start:s8-->T<!--bf-cond-end:s8-->|<!--bf-cond-start:s9-->F<!--bf-cond-end:s9-->|<!--bf-cond-start:s10-->F<!--bf-cond-end:s10-->|<!--bf-cond-start:s11-->F<!--bf-cond-end:s11-->|<!--bf-cond-start:s12-->F<!--bf-cond-end:s12-->|<!--bf-cond-start:s13-->T<!--bf-cond-end:s13--></span>
      <b bf-c="s15">if-numbers</b>
      <i bf-c="s16">if-not-mixed</i>
      <i bf-c="s17">if-not-nil</i>
      <span bf="s21"><!--bf-cond-start:s18-->T<!--bf-cond-end:s18-->|<!--bf-cond-start:s19-->F<!--bf-cond-end:s19-->|<!--bf-cond-start:s20-->F<!--bf-cond-end:s20--></span>
      <ul bf="s26">
        <li bf="s25" data-eq="y" data-key="1"><!--bf:s22-->1<!--/-->:<!--bf-cond-start:s23-->ne<!--bf-cond-end:s23-->:<!--bf-cond-start:s24-->differ<!--bf-cond-end:s24--></li>
        <li bf="s25" data-eq="n" data-key="2"><!--bf:s22-->2<!--/-->:<!--bf-cond-start:s23-->eq<!--bf-cond-end:s23-->:<!--bf-cond-start:s24-->differ<!--bf-cond-end:s24--></li>
        <li bf="s25" data-eq="n" data-key="3"><!--bf:s22-->3<!--/-->:<!--bf-cond-start:s23-->ne<!--bf-cond-end:s23-->:<!--bf-cond-start:s24-->differ<!--bf-cond-end:s24--></li>
      </ul>
      <ol bf="s28"><li data-key="a"><!--bf:s27-->a<!--/--></li></ol>
      <ol bf="s30">
        <li data-key="2"><!--bf:s29-->2<!--/--></li>
        <li data-key="3"><!--bf:s29-->3<!--/--></li>
      </ol>
      <ol bf="s32"></ol>
      <b bf-s="test_s33" bf="s1" data-label="numbers"><!--bf-cond-start:s0-->T<!--bf-cond-end:s0--></b>
      <b bf-s="test_s34" bf="s1" data-label="mixed"><!--bf-cond-start:s0-->F<!--bf-cond-end:s0--></b>
      <b bf-s="test_s35" bf="s1" data-label="nil"><!--bf-cond-start:s0-->F<!--bf-cond-end:s0--></b>
    </div>
  `,
})
