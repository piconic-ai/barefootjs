import { createFixture } from '../src/types'

/**
 * Bodyless component loop rows over array props, keyed by a read of the
 * SOURCE row rather than one of the child's props: a key field the child
 * takes no prop for, a same-named child prop passed a different field, the
 * same field passed under the key's own name, a nested row field, a
 * numeric row field, a destructured row binding, the row value of a string
 * array, and an empty array. Every row renders `data-key` from the row and
 * its props from the row.
 */
export const fixture = createFixture({
  id: 'loop-row-child-key-shapes',
  description: 'Component loop rows over array props key each row by the source row, whatever props the child takes',
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em className="badge">{props.label}</em>
}

function Tag(props: { id: string; label: string }) {
  return <b className="tag" data-id={props.id}>{props.label}</b>
}

function Chip(props: { id: string; label: string }) {
  return <i className="chip" data-id={props.id}>{props.label}</i>
}

function Pill(props: { label: string }) {
  return <s className="pill">{props.label}</s>
}

function Dot(props: { label: string }) {
  return <u className="dot">{props.label}</u>
}

function Note(props: { label: string }) {
  return <q className="note">{props.label}</q>
}

function Mark(props: { label: string }) {
  return <mark className="mark">{props.label}</mark>
}

function Cell(props: { label: string }) {
  return <span className="cell">{props.label}</span>
}

type Entry = { id: string; slug: string; label: string; meta: { id: string } }

export function LoopRowChildKeyShapes(props: {
  items: Entry[]
  nums: { n: number; label: string }[]
  names: string[]
  empty: { id: string; label: string }[]
}) {
  return (
    <div>
      <ul className="missing">
        {props.items.map(item => <Badge key={item.id} label={item.label} />)}
      </ul>
      <ul className="shadowed">
        {props.items.map(item => <Tag key={item.id} id={item.slug} label={item.label} />)}
      </ul>
      <ul className="same">
        {props.items.map(item => <Chip key={item.id} id={item.id} label={item.label} />)}
      </ul>
      <ul className="nested">
        {props.items.map(item => <Pill key={item.meta.id} label={item.label} />)}
      </ul>
      <ul className="numeric">
        {props.nums.map(row => <Dot key={row.n} label={row.label} />)}
      </ul>
      <ul className="destructured">
        {props.items.map(({ slug, label }) => <Note key={slug} label={label} />)}
      </ul>
      <ul className="scalar">
        {props.names.map(name => <Mark key={name} label={name} />)}
      </ul>
      <ul className="empty">
        {props.empty.map(item => <Cell key={item.id} label={item.label} />)}
      </ul>
    </div>
  )
}
`,
  props: {
    items: [
      { id: 'a', slug: 'x', label: 'A', meta: { id: 'm1' } },
      { id: 'b', slug: 'y', label: 'B', meta: { id: 'm2' } },
    ],
    nums: [
      { n: 1, label: 'one' },
      { n: 20, label: 'twenty' },
    ],
    names: ['p', 'q'],
    empty: [],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1" class="missing">
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="a"><!--bf:s0-->A<!--/--></em>
        <em bf-s="Badge_*" bf="s1" class="badge" data-key="b"><!--bf:s0-->B<!--/--></em>
      </ul>
      <ul bf="s3" class="shadowed">
        <b bf-s="Tag_*" bf="s1" class="tag" data-id="x" data-key="a"><!--bf:s0-->A<!--/--></b>
        <b bf-s="Tag_*" bf="s1" class="tag" data-id="y" data-key="b"><!--bf:s0-->B<!--/--></b>
      </ul>
      <ul bf="s5" class="same">
        <i bf-s="Chip_*" bf="s1" class="chip" data-id="a" data-key="a"><!--bf:s0-->A<!--/--></i>
        <i bf-s="Chip_*" bf="s1" class="chip" data-id="b" data-key="b"><!--bf:s0-->B<!--/--></i>
      </ul>
      <ul bf="s7" class="nested">
        <s bf-s="Pill_*" bf="s1" class="pill" data-key="m1"><!--bf:s0-->A<!--/--></s>
        <s bf-s="Pill_*" bf="s1" class="pill" data-key="m2"><!--bf:s0-->B<!--/--></s>
      </ul>
      <ul bf="s9" class="numeric">
        <u bf-s="Dot_*" bf="s1" class="dot" data-key="1"><!--bf:s0-->one<!--/--></u>
        <u bf-s="Dot_*" bf="s1" class="dot" data-key="20"><!--bf:s0-->twenty<!--/--></u>
      </ul>
      <ul bf="s11" class="destructured">
        <q bf-s="Note_*" bf="s1" class="note" data-key="x"><!--bf:s0-->A<!--/--></q>
        <q bf-s="Note_*" bf="s1" class="note" data-key="y"><!--bf:s0-->B<!--/--></q>
      </ul>
      <ul bf="s13" class="scalar">
        <mark bf-s="Mark_*" bf="s1" class="mark" data-key="p"><!--bf:s0-->p<!--/--></mark>
        <mark bf-s="Mark_*" bf="s1" class="mark" data-key="q"><!--bf:s0-->q<!--/--></mark>
      </ul>
      <ul bf="s15" class="empty"></ul>
    </div>
  `,
})
