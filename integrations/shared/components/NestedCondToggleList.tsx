'use client'

// Test fixture (#2347): a per-item conditional (`item.hidden ? null : <button/>`)
// wraps an element that itself carries a dynamic `className` AND an
// `onClick` handler. Regression coverage for a compiler bug where such an
// element was bound twice — once directly against the loop item's own
// initial template clone, once again inside the conditional's `insert()`
// bindEvents against whatever node it mounts — causing a double-firing
// click handler and a `className` effect left pointed at a detached node.

import { createSignal } from '@barefootjs/client'

interface ToggleItem {
  id: string
  hidden: boolean
  active: boolean
}

interface NestedCondToggleListProps {
  items?: ToggleItem[]
}

export function NestedCondToggleList(props: NestedCondToggleListProps) {
  const [items, setItems] = createSignal<ToggleItem[]>(props.items ?? [])

  const toggle = (id: string) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, active: !it.active } : it)))
  }

  return (
    <ul className="toggle-list">
      {items().map(item => (
        <li key={item.id} className="toggle-row">
          {item.hidden ? null : (
            <button
              className={item.active ? 'toggle-btn on' : 'toggle-btn'}
              data-testid={`toggle-${item.id}`}
              onClick={() => toggle(item.id)}
            >
              {item.active ? 'On' : 'Off'}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
