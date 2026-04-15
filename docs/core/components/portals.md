---
title: Portals
description: Render elements outside their parent DOM hierarchy for overlays, modals, and tooltips.
---

# Portals

Portals render elements outside their parent DOM hierarchy — useful for overlays, modals, and tooltips that need to escape `overflow: hidden` or `z-index` stacking contexts.

```tsx
import { createPortal } from '@barefootjs/client'
```


## `createPortal`

Moves an element to a different DOM container.

```tsx
createPortal(children, container?, options?)
```

**Type:**

```tsx
type Portal = {
  element: HTMLElement
  unmount: () => void
}

interface PortalOptions {
  ownerScope?: Element  // Component scope for scoped queries
}

function createPortal(
  children: HTMLElement | string,
  container?: HTMLElement,           // Default: document.body
  options?: PortalOptions
): Portal
```

**Returns** a `Portal` object with:
- `element` — the mounted DOM element
- `unmount()` — removes the element from the container


## Basic Usage

Create portals inside `ref` callbacks:

```tsx
"use client"
import { createSignal, createEffect, createPortal, isSSRPortal } from '@barefootjs/client'

export function Tooltip(props: { text: string; children?: Child }) {
  const [visible, setVisible] = createSignal(false)

  const handleMount = (el: HTMLElement) => {
    // Move to document.body to avoid overflow/z-index issues
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


## SSR Portal Detection

`isSSRPortal` checks whether an element was already portaled during SSR to prevent double-portaling:

```tsx
import { isSSRPortal } from '@barefootjs/client'

const handleMount = (el: HTMLElement) => {
  // Skip if already portaled during SSR
  if (el.parentNode !== document.body && !isSSRPortal(el)) {
    createPortal(el, document.body)
  }
}
```

After hydration, remove SSR placeholders:

```tsx
import { cleanupPortalPlaceholder } from '@barefootjs/client'

cleanupPortalPlaceholder(portalId)
```


## Owner Scope

A portaled element is outside its original component's scope, so `find()` cannot locate it. The `ownerScope` option links it back:

```tsx
const handleMount = (el: HTMLElement) => {
  const ownerScope = el.closest('[bf-s]') ?? undefined
  createPortal(el, document.body, { ownerScope })
}
```

`bf-po` on the moved element lets scoped queries from the owner still find it.


## Dialog Example

Dialog overlays are a common portal use case:

```tsx
"use client"
import { createPortal, isSSRPortal, useContext, createEffect } from '@barefootjs/client'

function DialogOverlay() {
  const handleMount = (el: HTMLElement) => {
    // Portal to body
    if (el.parentNode !== document.body && !isSSRPortal(el)) {
      const ownerScope = el.closest('[bf-s]') ?? undefined
      createPortal(el, document.body, { ownerScope })
    }

    const ctx = useContext(DialogContext)

    // Reactive visibility
    createEffect(() => {
      const isOpen = ctx.open()
      el.dataset.state = isOpen ? 'open' : 'closed'
      el.className = isOpen ? 'overlay overlay-visible' : 'overlay overlay-hidden'
    })

    // Click overlay to close
    el.addEventListener('click', () => {
      ctx.onOpenChange(false)
    })
  }

  return <div data-slot="dialog-overlay" ref={handleMount} />
}
```

The overlay accesses `DialogContext` from the component tree but is moved to `document.body` to escape CSS containment.


## Cleanup

Combine `portal.unmount()` with `onCleanup`:

```tsx
import { createPortal, onCleanup } from '@barefootjs/client'

const handleMount = (el: HTMLElement) => {
  const portal = createPortal(el, document.body)

  onCleanup(() => {
    portal.unmount()
  })
}
```


## Custom Container

Specify a different container instead of the default `document.body`:

```tsx
const container = document.getElementById('modal-root')!
createPortal(el, container)
```
