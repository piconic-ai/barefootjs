'use client'

// Test fixture (flatMap client-loop rewiring): a signal-driven list whose
// rendering is a `.flatMap()` BLOCK body — early return for empty tag sets,
// a `const` before the return, and a keyed leaf per tag. Regression coverage
// for the descriptor-based mapArray path:
//   - hydration must adopt every SSR leaf (pre-fix: reconciled against the
//     UN-flattened source with index keys — leaves vanished on load),
//   - adding items must create new leaf elements (pre-fix: cloneNode(null)
//     crash against an empty item template),
//   - changing leaf content under a stable key must patch in place,
//   - removing items must drop exactly their leaves.
// Data carries `<`, `&`, `"` to pin escaping through the leaf door.

import { createSignal } from '@barefootjs/client'

interface TagItem {
  id: number
  label: string
  tags: string[]
}

interface TagCloudProps {
  items?: TagItem[]
}

export function TagCloud(props: TagCloudProps) {
  const [items, setItems] = createSignal<TagItem[]>(props.items ?? [])
  const [nextId, setNextId] = createSignal(100)

  const add = () => {
    const id = nextId()
    setNextId(id + 1)
    setItems([...items(), { id, label: `new & <fresh> #${id}`, tags: [`x "${id}"`] }])
  }
  const dropFirst = () => setItems(items().slice(1))
  const shout = () =>
    setItems(items().map(it => ({ ...it, label: it.label.toUpperCase() })))

  return (
    <div className="tag-cloud">
      <button className="add" onClick={add}>add</button>
      <button className="drop" onClick={dropFirst}>drop</button>
      <button className="shout" onClick={shout}>shout</button>
      <ul className="tags">
        {items().flatMap(item => {
          if (item.tags.length === 0) return []
          const prefix = item.label + ' — '
          return item.tags.map(tag => (
            <li key={`${item.id}:${tag}`} data-tag={tag}>{prefix}{tag}</li>
          ))
        })}
      </ul>
    </div>
  )
}
