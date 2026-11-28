import { createFixture } from '../src/types'

/**
 * Keyed component loop rows whose child props include constants the same on
 * every row: a required string-array prop, an object, a number and a
 * boolean, and rows whose props are all constants under an index key (the
 * row value itself is never read). Signal-backed and prop-backed loops, a
 * key read from a row field, and rows nested in another loop's row.
 */
export const fixture = createFixture({
  id: 'loop-row-constant-props',
  description: 'Keyed component loop rows receive constant child props (required array, object, number, boolean) on every row',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: string }
type Group = { id: string; items: string[] }
function Tagged(props: { label: string; tags: string[] }) {
  return <i>{props.label}:{props.tags.join(',')}</i>
}
function Const(props: { label: string }) {
  return <s>{props.label}</s>
}
function Meta(props: { label: string; meta: { a: number }; n: number; on: boolean }) {
  return <b>{props.label}:{props.meta.a}:{props.n}:{props.on ? 'on' : 'off'}</b>
}
export function Host(props: { items: string[]; rows: Row[]; groups: Group[] }) {
  const [items] = createSignal(props.items)
  const [rows] = createSignal(props.rows)
  const [groups] = createSignal(props.groups)
  return (
    <div>
      <ul>{items().map((x) => <Tagged key={x} label={x} tags={['t', 'u']} />)}</ul>
      <ul>{items().map((item, i) => <Const key={i} label="constant" />)}</ul>
      <ol>{props.items.map((item, i) => <Const key={i} label="constant" />)}</ol>
      <ul>{items().map((x) => <Meta key={x} label={x} meta={{ a: 1 }} n={2} on={false} />)}</ul>
      <ul>{rows().map((r) => <Tagged key={r.id} label={r.id} tags={['v']} />)}</ul>
      <div>{groups().map((g) => <section key={g.id}>{g.items.map((x) => <Tagged key={x} label={x} tags={['w']} />)}</section>)}</div>
    </div>
  )
}
`,
  props: { items: ['a', 'b'], rows: [{ id: 'r1' }, { id: 'r2' }], groups: [{ id: 'g', items: ['x', 'y'] }] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <i bf-s="Tagged_*" bf="s2" data-key="a"><!--bf:s0-->a<!--/-->:<!--bf:s1-->t,u<!--/--></i>
        <i bf-s="Tagged_*" bf="s2" data-key="b"><!--bf:s0-->b<!--/-->:<!--bf:s1-->t,u<!--/--></i>
      </ul>
      <ul bf="s3">
        <s bf-s="Const_*" bf="s1" data-key="0"><!--bf:s0-->constant<!--/--></s>
        <s bf-s="Const_*" bf="s1" data-key="1"><!--bf:s0-->constant<!--/--></s>
      </ul>
      <ol bf="s5">
        <s bf-s="Const_*" bf="s1" data-key="0"><!--bf:s0-->constant<!--/--></s>
        <s bf-s="Const_*" bf="s1" data-key="1"><!--bf:s0-->constant<!--/--></s>
      </ol>
      <ul bf="s7">
        <b bf-s="Meta_*" bf="s5" data-key="a"><!--bf:s0-->a<!--/-->:<!--bf:s1-->1<!--/-->:<!--bf:s2-->2<!--/-->:<!--bf-cond-start:s3-->off<!--bf-cond-end:s3--></b>
        <b bf-s="Meta_*" bf="s5" data-key="b"><!--bf:s0-->b<!--/-->:<!--bf:s1-->1<!--/-->:<!--bf:s2-->2<!--/-->:<!--bf-cond-start:s3-->off<!--bf-cond-end:s3--></b>
      </ul>
      <ul bf="s9">
        <i bf-s="Tagged_*" bf="s2" data-key="r1"><!--bf:s0-->r1<!--/-->:<!--bf:s1-->v<!--/--></i>
        <i bf-s="Tagged_*" bf="s2" data-key="r2"><!--bf:s0-->r2<!--/-->:<!--bf:s1-->v<!--/--></i>
      </ul>
      <div bf="s12"><section bf="s11" data-key="g"><i bf-s="Tagged_*" bf="s2" data-key="x"><!--bf:s0-->x<!--/-->:<!--bf:s1-->w<!--/--></i><i bf-s="Tagged_*" bf="s2" data-key="y"><!--bf:s0-->y<!--/-->:<!--bf:s1-->w<!--/--></i></section></div>
    </div>
  `,
})
