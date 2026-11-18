'use client'

// Test fixture: rows of a static (module-const) array whose row component
// renders a child component of its own at the slot number the row itself is
// mounted at (`Badge` at the parent's `s0`, `Dot` at `Badge`'s `s0`). The
// row's child is scoped `<row>_s0` and names its row as host, so the static
// array's row init must take the rows only: zipping the children in too
// hands a later row's item to an earlier row. `.flat` is a plain loop,
// `.grouped` the same row as a loop forwarded into a component row.

import { createSignal } from '@barefootjs/client'

function Dot(props: { tone: string }) {
  return <i className="dot" data-tone={props.tone} />
}

function Badge(props: { label: string; onPick: (label: string) => void }) {
  return (
    <em className="badge">
      <button type="button" className="pick" onClick={() => props.onPick(props.label)}>{props.label}</button>
      <Dot tone={props.label} />
      <Dot tone={props.label} />
      <Dot tone={props.label} />
    </em>
  )
}

function Group(props: { name: string; children?: any }) {
  return <section className="group" data-name={props.name}>{props.children}</section>
}

const FLAT = ['a', 'b', 'c']
const GROUPS = [
  { name: 'x', tags: ['a', 'b'] },
  { name: 'y', tags: ['c'] },
]

export function StaticLoopRowChildOwnSlot() {
  const [picked, setPicked] = createSignal('none')
  return (
    <div>
      <p className="picked">{picked()}</p>
      <div className="flat">
        {FLAT.map((t) => (
          <Badge key={t} label={t} onPick={(label) => setPicked(`f-${label}`)} />
        ))}
      </div>
      <div className="grouped">
        {GROUPS.map((g) => (
          <Group key={g.name} name={g.name}>
            {g.tags.map((t) => (
              <Badge key={t} label={t} onPick={(label) => setPicked(`g-${label}`)} />
            ))}
          </Group>
        ))}
      </div>
    </div>
  )
}
