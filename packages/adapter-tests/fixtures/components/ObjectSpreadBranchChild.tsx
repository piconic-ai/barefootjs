'use client'

// Test fixture (#3861 follow-up): the UI `Slot` shape with a real child
// component. The object spread reads a member of a prop
// (`{...item.inner}`) inside an early-return branch, so the spread value
// exists only when the branch is taken. The first `Pick` takes the fallback
// branch (no `item`), and its init must not read `item.inner`; the second
// takes the spread branch, and its child must hydrate. The `<span>` keeps
// the branch root an element: a component whose early-return root is
// itself a child component is a separate hydration case.

import { createSignal } from '@barefootjs/client'

type Inner = { label: string; size: number }

function Chip(props: { label: string; size?: number; tone?: string }) {
  const [on, setOn] = createSignal(false)
  return <button data-size={props.size} data-tone={props.tone} onClick={() => setOn(!on())}>{props.label}{on() ? '!' : ''}</button>
}

function Pick({ item, tone }: { item?: { inner: Inner }; tone: string }) {
  if (item) {
    const inner = item.inner
    return <span><Chip tone={tone} {...inner} /></span>
  }
  return <em data-tone={tone}>none</em>
}

export function ObjectSpreadBranchChild({ item }: { item: { inner: Inner } }) {
  return <div><Pick tone="empty" /><Pick tone="full" item={item} /></div>
}
