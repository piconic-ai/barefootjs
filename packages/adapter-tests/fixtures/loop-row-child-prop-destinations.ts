import { createFixture } from '../src/types'

/**
 * Bodyless component loop rows over array props whose row reads land on
 * Input fields of a different type, or not on a declared field at all: the
 * whole row and an object field passed to object-shaped child props, and a
 * rest-bag attribute carrying the key ahead of the declared prop that also
 * carries it (with an object field keeping the caller-supplied rows). Every
 * row renders its props and its `data-key`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-prop-destinations',
  description: 'Component loop rows deliver row reads only to Input fields that can hold them',
  source: `
'use client'

function Badge(props: { id: string; value: { label: string } }) {
  return <em className="badge" data-id={props.id}>{props.value.label}</em>
}

function Pill(props: { id: string; meta: { tone: string } }) {
  return <s className="pill" data-id={props.id}>{props.meta.tone}</s>
}

function Tag({ id, meta, ...rest }: { id: string; meta: { tone: string }; [key: string]: unknown }) {
  return <b className="tag" data-id={id} {...rest}>{meta.tone}</b>
}

type Entry = { id: string; label: string; meta: { tone: string } }

export function LoopRowChildPropDestinations(props: { items: Entry[] }) {
  return (
    <div>
      <ul className="whole-row">
        {props.items.map(item => <Badge key={item.id} id={item.id} value={item} />)}
      </ul>
      <ul className="object-field">
        {props.items.map(item => <Pill key={item.id} id={item.id} meta={item.meta} />)}
      </ul>
      <ul className="rest-carrier">
        {props.items.map(item => (
          <Tag key={item.id} token={item.id} id={item.id} meta={item.meta} />
        ))}
      </ul>
    </div>
  )
}
`,
  props: {
    items: [
      { id: 'a', label: 'A', meta: { tone: 'warm' } },
      { id: 'b', label: 'B', meta: { tone: 'cool' } },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1" class="whole-row">
        <em bf-s="Badge_*" bf="s1" class="badge" data-id="a" data-key="a"><!--bf:s0-->A<!--/--></em>
        <em bf-s="Badge_*" bf="s1" class="badge" data-id="b" data-key="b"><!--bf:s0-->B<!--/--></em>
      </ul>
      <ul bf="s3" class="object-field">
        <s bf-s="Pill_*" bf="s1" class="pill" data-id="a" data-key="a"><!--bf:s0-->warm<!--/--></s>
        <s bf-s="Pill_*" bf="s1" class="pill" data-id="b" data-key="b"><!--bf:s0-->cool<!--/--></s>
      </ul>
      <ul bf="s5" class="rest-carrier">
        <b bf-s="Tag_*" bf="s1" class="tag" data-id="a" data-key="a" token="a"><!--bf:s0-->warm<!--/--></b>
        <b bf-s="Tag_*" bf="s1" class="tag" data-id="b" data-key="b" token="b"><!--bf:s0-->cool<!--/--></b>
      </ul>
    </div>
  `,
})
