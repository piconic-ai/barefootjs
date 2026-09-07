'use client'

// Test fixture (#2861): a nested `.map()` whose row reads the OUTER loop's
// own index parameter — not its own index, and not the outer item.
//
// Before the fix, `collectInnerLoops` classified an inner loop's own row
// bindings against only the INNER loop's own item/index — a reference to
// the loop ONE LEVEL UP was invisible to `classifyReactivity` no matter
// what it depended on, so it was baked into the row's initial template
// once and never revisited (a pre-existing gap independent of, but
// discovered alongside, the same-loop pure-index gap this issue is
// primarily about).
//
// Rotating the OUTER array (same keys, reordered) moves each group to a
// new position without recreating it — the inner list must show the
// group's CURRENT index, not whichever index it was first rendered at.

import { createSignal } from '@barefootjs/client'

interface Item {
  id: number
  label: string
}

interface Group {
  id: number
  items: Item[]
}

export function NestedLoopOuterIndexReorder() {
  const [groups, setGroups] = createSignal<Group[]>([
    { id: 1, items: [{ id: 11, label: 'one' }] },
    { id: 2, items: [{ id: 21, label: 'two' }] },
    { id: 3, items: [{ id: 31, label: 'three' }] },
  ])

  const rotate = () => {
    setGroups(prev => {
      const [first, ...rest] = prev
      return [...rest, first]
    })
  }

  return (
    <div>
      <button type="button" class="rotate" onClick={rotate}>
        Rotate
      </button>
      <ul class="groups">
        {groups().map((group, gi) => (
          <li key={group.id}>
            <ul class="items">
              {group.items.map(item => (
                <li key={item.id} class="item">
                  <span class="group-index">{gi}</span>
                  <span class="label">{item.label}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
