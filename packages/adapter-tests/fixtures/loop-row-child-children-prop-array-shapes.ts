import { createFixture } from '../src/types'

/**
 * Sibling shapes of `loop-row-child-children-prop-array`: a `.map()` over an
 * array prop whose row is a child component with forwarded JSX children read
 * off the row. Covers a destructured (and renamed) array prop, forwarded
 * children reading a nested row field (`item.meta.label`), a row that also
 * passes a row field as the component's own prop — under the same name
 * (`tone={item.tone}`) and under another (`tone={item.shade}`) — and an
 * empty / absent (defaulted) array prop that renders no rows.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-prop-array-shapes',
  description: "Component loop rows over array props render every row's forwarded children",
  source: `
'use client'

function Badge(props: { children?: any }) {
  return <em className="badge">{props.children}</em>
}

function Tag(props: { tone: string; children?: any }) {
  return <b className={props.tone}>{props.children}</b>
}

function Hue(props: { tone: string; children?: any }) {
  return <i className={props.tone}>{props.children}</i>
}

function Pill(props: { children?: any }) {
  return <s className="pill">{props.children}</s>
}

function Dot(props: { children?: any }) {
  return <u className="dot">{props.children}</u>
}

type Entry = { id: string; label: string }

export function LoopRowChildChildrenPropArrayShapes({
  items,
  tagged: toned,
  shaded,
  empty,
  extra = [],
}: {
  items: { id: string; meta: { label: string } }[]
  tagged: { id: string; tone: string; label: string }[]
  shaded: { id: string; shade: string; label: string }[]
  empty: Entry[]
  extra?: Entry[]
}) {
  return (
    <div>
      <ul className="nested">
        {items.map(item => (
          <Badge key={item.id}>{item.meta.label}</Badge>
        ))}
      </ul>
      <ul className="toned">
        {toned.map(item => (
          <Tag key={item.id} tone={item.tone}>{item.label}</Tag>
        ))}
      </ul>
      <ul className="shaded">
        {shaded.map(item => (
          <Hue key={item.id} tone={item.shade}>{item.label}</Hue>
        ))}
      </ul>
      <ul className="empty">
        {empty.map(item => (
          <Pill key={item.id}>{item.label}</Pill>
        ))}
      </ul>
      <ul className="absent">
        {extra.map(item => (
          <Dot key={item.id}>{item.label}</Dot>
        ))}
      </ul>
    </div>
  )
}
`,
  props: {
    items: [
      { id: 'a', meta: { label: 'A' } },
      { id: 'b', meta: { label: 'B' } },
    ],
    tagged: [
      { id: 'x', tone: 'warm', label: 'X' },
      { id: 'y', tone: 'cool', label: 'Y' },
    ],
    shaded: [
      { id: 'p', shade: 'dark', label: 'P' },
      { id: 'q', shade: 'light', label: 'Q' },
    ],
    empty: [],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2" class="nested">
        <em bf-s="Badge_*" class="badge" data-key="a"><!--bf:^s0-->A<!--/--></em>
        <em bf-s="Badge_*" class="badge" data-key="b"><!--bf:^s0-->B<!--/--></em>
      </ul>
      <ul bf="s5" class="toned">
        <b bf-s="Tag_*" bf="s0" class="warm" data-key="x"><!--bf:^s3-->X<!--/--></b>
        <b bf-s="Tag_*" bf="s0" class="cool" data-key="y"><!--bf:^s3-->Y<!--/--></b>
      </ul>
      <ul bf="s8" class="shaded">
        <i bf-s="Hue_*" bf="s0" class="dark" data-key="p"><!--bf:^s6-->P<!--/--></i>
        <i bf-s="Hue_*" bf="s0" class="light" data-key="q"><!--bf:^s6-->Q<!--/--></i>
      </ul>
      <ul bf="s11" class="empty"></ul>
      <ul bf="s14" class="absent"></ul>
    </div>
  `,
})
