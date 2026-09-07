---
title: untrack
description: Executes a function without tracking signal dependencies in the current reactive context.
---

# untrack

Executes a function without tracking signal dependencies.

```tsx
import { untrack } from '@barefootjs/client'

untrack<T>(fn: () => T): T
```

Returns the value produced by `fn`.


## Basic Usage

```tsx
const [count, setCount] = createSignal(0)
const [name, setName] = createSignal('Alice')

createEffect(() => {
  // count() IS tracked — this effect re-runs when count changes
  console.log('count:', count())

  // name() is NOT tracked — changing name alone won't trigger this effect
  console.log('name:', untrack(() => name()))
})

setCount(1) // Effect re-runs
setName('Bob') // Effect does NOT re-run
```


## When to Use

### Read without subscribing

```tsx
createEffect(() => {
  // Re-run only when items change, not when sortOrder changes
  const sorted = [...items()].sort(untrack(() => sortOrder()) === 'asc' ? compare : reverseCompare)
  setDisplayList(sorted)
})
```

### Log without dependencies

```tsx
createEffect(() => {
  const value = computedResult()
  console.log('Updated at:', untrack(() => new Date().toISOString()))
})
```

### Break circular dependencies

`untrack` breaks cycles where two signals depend on each other through effects:

```tsx
createEffect(() => {
  const a = signalA()
  const b = untrack(() => signalB()) // Read B without tracking
  setResult(a + b)
})
```


## What `untrack` Does Not Do

`untrack` only stops the wrapped read from **registering a dependency**. It does not stop the surrounding effect from **re-running** — and when the effect re-runs for any other reason, the code inside `untrack` runs again too.

This matters because BarefootJS groups several bindings into one effect for performance: every reactive attribute on one element shares an effect, and a keyed `.map()` row's attributes and text share a single row effect. When one binding in that group changes, the whole effect re-runs, and every expression in it — untracked or not — is evaluated again.

```tsx
'use client'
import { createSignal, untrack } from '@barefootjs/client'

function renderPreview(id: number): string {
  return `<p>Preview for item ${id}</p>`
}

export function Gallery() {
  const [items, setItems] = createSignal([{ id: 1, label: 'First' }, { id: 2, label: 'Second' }])
  const rename = () => setItems(items().map(item => ({ id: item.id, label: item.label + '!' })))
  return (
    <div>
      <button onClick={rename}>Rename all</button>
      <ul>
        {items().map(item => (
          <li key={item.id} title={item.label} data-preview={untrack(() => renderPreview(item.id))}>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

Clicking "Rename all" changes `title` on every row, so every row effect re-runs and `renderPreview` is called again for each row even though it is wrapped in `untrack`. Two guarantees hold regardless:

- The untracked read still does not subscribe: a signal read only inside `untrack` never triggers the effect on its own.
- A DOM write is skipped when the binding's new value is the same as the last one it computed (compared with `Object.is`). `data-preview` above is recomputed on every run but not rewritten, so an attribute whose write is expensive to apply — `srcdoc` on an `<iframe>`, which reloads the frame on every assignment — stays untouched until its value actually changes.

If the **computation** itself is what you need to avoid repeating, `untrack` is the wrong tool: put it in a `createMemo` so it only re-runs when its own inputs change.
