---
title: Context API
description: Share state with nested components in the same file via createContext and useContext, and across files via events or server props.
---

# Context API

Context shares state with nested components without prop drilling; compound components (Dialog, Accordion, Tabs) are built on it.

```ts
const Ctx = createContext<T>(defaultValue?: T)

<Ctx.Provider value={value}>{children}</Ctx.Provider>

const value = useContext(Ctx)   // T | undefined
```

- `createContext(defaultValue?)` creates a context (both functions come from `@barefootjs/client`).
- `Provider` makes `value` available to every descendant; it compiles to a `provideContext()` call that runs synchronously before the children initialize.
- `useContext` returns the nearest provided value, else the default passed to `createContext`, else `undefined`. It never throws, so guard an optional context with `?.`.

A context value can hold signal getters; reading one inside `createEffect` makes the effect reactive.


## Example: Accordion

The root provides the state; sub-components read it in their `ref` callbacks, once the DOM exists to walk up to the provider.

```tsx
"use client"
import { createSignal, createContext, useContext, createEffect } from '@barefootjs/client'

interface AccordionContextValue {
  activeItem: () => string | null
  toggle: (id: string) => void
}

const AccordionContext = createContext<AccordionContextValue>()

export function Accordion(props: { children?: Child }) {
  const [activeItem, setActiveItem] = createSignal<string | null>(null)
  const toggle = (id: string) => setActiveItem(prev => (prev === id ? null : id))

  return (
    <AccordionContext.Provider value={{ activeItem, toggle }}>
      <div data-slot="accordion">{props.children}</div>
    </AccordionContext.Provider>
  )
}

export function AccordionTrigger(props: { itemId: string; children?: Child }) {
  const handleMount = (el: HTMLButtonElement) => {
    const ctx = useContext(AccordionContext)

    el.addEventListener('click', () => ctx.toggle(props.itemId))

    createEffect(() => {
      el.setAttribute('aria-expanded', String(ctx.activeItem() === props.itemId))
    })
  }

  // Nothing is open at SSR, so render the initial state; the effect keeps it in sync.
  return <button aria-expanded="false" ref={handleMount}>{props.children}</button>
}

export function AccordionContent(props: { itemId: string; children?: Child }) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(AccordionContext)

    createEffect(() => {
      el.hidden = ctx.activeItem() !== props.itemId
    })
  }

  return <div ref={handleMount}>{props.children}</div>
}
```


## Context is same-file only

`createContext()` and every component that provides or reads it must live in the **same file**. Importing a context from another file compiles, but the consumer never finds the provider's value.


## Sharing state across files

Each `.tsx` file compiles to its own client bundle, and a context's identity is a `Symbol` created when that bundle loads, so a consumer in one file never matches a provider in another. Module-level state is per bundle the same way. Three ways around it:

| Option | When |
|--------|------|
| Put the components in one file | Tightly coupled, always used together |
| Dispatch a custom DOM event | Separate files sharing a DOM ancestor |
| Let the server pass props | State originates on the server (database, session, URL) |

A custom event needs no shared import; the receiver updates its own signal:

```tsx
"use client"
import { createSignal, onMount, onCleanup } from '@barefootjs/client'

export function Elapsed() {
  const [elapsedMs, setElapsedMs] = createSignal(0)

  onMount(() => {
    const onTimeUpdate = (e: Event) => setElapsedMs((e as CustomEvent).detail.elapsedMs)
    document.addEventListener('playback:timeupdate', onTimeUpdate)
    onCleanup(() => document.removeEventListener('playback:timeupdate', onTimeUpdate))
  })

  return <span>{Math.floor(elapsedMs() / 1000)}s</span>
}
```

The sender calls `el.dispatchEvent(new CustomEvent('playback:timeupdate', { bubbles: true, detail: { elapsedMs } }))`. Server-passed props give each component its initial value only; later updates still go through events.
