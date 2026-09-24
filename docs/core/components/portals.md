---
title: Portals
description: Move an element to document.body or another container with createPortal, for tooltips, dialogs, and overlays.
---

# Portals

A portal moves an element out of its parent's DOM position, so overlays, dialogs, and tooltips escape `overflow: hidden` and `z-index` stacking contexts.

```ts
createPortal(children, container?, options?): { element, unmount }
```

| Parameter | Description |
|-----------|-------------|
| `children` | The element (or string) to move |
| `container` | Where to append it; default `document.body` |
| `options.ownerScope` | The owning component's scope element (`el.closest('[bf-s]')`) |

It returns the mounted `element` and an `unmount()` function that removes it from the container.


## Example: Tooltip

Create the portal in a `ref` callback, once the element exists:

```tsx
"use client"
import { createSignal, createEffect, createPortal, isSSRPortal } from '@barefootjs/client'

export function Tooltip(props: { text: string; children?: Child }) {
  const [visible, setVisible] = createSignal(false)

  const handleMount = (el: HTMLElement) => {
    if (el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    createEffect(() => {
      el.hidden = !visible()
    })
  }

  return (
    <div>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        {props.children}
      </span>
      <div className="tooltip" ref={handleMount}>
        {props.text}
      </div>
    </div>
  )
}
```

`isSSRPortal(el)` is true when the server already rendered the element at its portal destination, so the guard skips portaling it twice. `ownerScope` marks the moved element as belonging to its component, which keeps scoped queries finding it and keeps `document.body` child order stable (component root first, then its portals in creation order).


## Cleanup

Remove the portal when the component is disposed:

```tsx
"use client"
import { createPortal, onCleanup } from '@barefootjs/client'

const handleMount = (el: HTMLElement) => {
  const portal = createPortal(el, document.body)

  onCleanup(() => {
    portal.unmount()
  })
}
```

To target a container other than `document.body`, pass it as the second argument: `createPortal(el, document.getElementById('modal-root')!)`.
