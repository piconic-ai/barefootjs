---
title: Shared State Patterns
description: Patterns for sharing reactive state between components in separate files, and when to use each.
---

# Shared State Patterns

The [Context API](../components/context-api.md) shares state between components in the **same file** (compound components like Accordion, Dialog, Tabs). But the compilation model — one `.tsx` file produces one `.client.js` bundle — means context **cannot cross file boundaries**.

This guide covers patterns for sharing reactive state between components in **separate files**.


## Why Context Doesn't Work Across Files

Each `.client.js` bundle is independent. When the compiler processes two files that both reference the same `createContext()`, each bundle gets its own call — producing a unique `Symbol` id. The provider's context and the consumer's context are different objects:

```
PlaybackProvider.client.js  →  createContext()  →  Symbol(#1)
Player.client.js            →  createContext()  →  Symbol(#2)
                                                    ↑ different identity
```

`useContext` in Player walks the DOM looking for `Symbol(#2)`, but PlaybackProvider set `Symbol(#1)`. No match — the value is never found.


## Pattern 1: Consolidate Into One File

The simplest solution. If components are tightly coupled, put them in the same file:

```tsx
"use client"
import { createContext, useContext, createSignal, createEffect } from '@barefootjs/client'

interface PlaybackContextValue {
  elapsedMs: () => number
  playing: () => boolean
  seek: (ms: number) => void
  toggle: () => void
}

const PlaybackContext = createContext<PlaybackContextValue>()

export function PlaybackProvider(props: { children?: unknown }) {
  const [elapsedMs, setElapsedMs] = createSignal(0)
  const [playing, setPlaying] = createSignal(false)

  const seek = (ms: number) => setElapsedMs(ms)
  const toggle = () => setPlaying(p => !p)

  return (
    <PlaybackContext.Provider value={{ elapsedMs, playing, seek, toggle }}>
      {props.children}
    </PlaybackContext.Provider>
  )
}

export function Player(props: { children?: unknown }) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(PlaybackContext)
    createEffect(() => {
      el.textContent = `${Math.floor(ctx.elapsedMs() / 1000)}s`
    })
  }
  return <div ref={handleMount}>{props.children}</div>
}

export function TimelineBar(props: { duration: number }) {
  const handleMount = (el: HTMLElement) => {
    const ctx = useContext(PlaybackContext)
    el.addEventListener('click', (e) => {
      const rect = el.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      ctx.seek(ratio * props.duration)
    })
  }
  return <div ref={handleMount} className="timeline" />
}
```

**When to use:** Components share a tight contract and are always used together (like Select + SelectTrigger + SelectContent).

| Pros | Cons |
|------|------|
| Full reactivity via signals | All components in one file |
| Type-safe | File grows with component count |
| Works with Context API | Not suitable for loosely coupled components |


## Pattern 2: Custom DOM Events

Use the browser's native event system. One component dispatches events, others listen. No shared module state needed.

Player (`components/Player.tsx`):

```tsx
"use client"
import { createSignal, createEffect, onCleanup } from '@barefootjs/client'

export function Player() {
  const [elapsedMs, setElapsedMs] = createSignal(0)

  const handleMount = (el: HTMLElement) => {
    createEffect(() => {
      el.dispatchEvent(new CustomEvent('playback:timeupdate', {
        bubbles: true,
        detail: { elapsedMs: elapsedMs() },
      }))
    })

    const onSeek = ((e: CustomEvent) => {
      setElapsedMs(e.detail.ms)
    }) as EventListener

    document.addEventListener('playback:seek', onSeek)
    onCleanup(() => document.removeEventListener('playback:seek', onSeek))
  }

  return <div ref={handleMount} />
}
```

TimelineBar (`components/TimelineBar.tsx`):

```tsx
"use client"
import { onCleanup } from '@barefootjs/client'

export function TimelineBar(props: { duration: number }) {
  const handleMount = (el: HTMLElement) => {
    const onTimeUpdate = ((e: CustomEvent) => {
      const ratio = e.detail.elapsedMs / props.duration
      el.style.setProperty('--progress', String(ratio))
    }) as EventListener

    document.addEventListener('playback:timeupdate', onTimeUpdate)
    onCleanup(() => document.removeEventListener('playback:timeupdate', onTimeUpdate))

    el.addEventListener('click', (e) => {
      const rect = el.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      el.dispatchEvent(new CustomEvent('playback:seek', {
        bubbles: true,
        detail: { ms: ratio * props.duration },
      }))
    })
  }

  return <div ref={handleMount} className="timeline" />
}
```

**When to use:** Components are in separate files and communicate through a shared parent in the DOM.

| Pros | Cons |
|------|------|
| Works across any file boundary | Not reactive — imperative dispatch/listen |
| No shared imports needed | No type safety on event payloads (use a shared type file to mitigate) |
| Familiar browser API | Requires manual cleanup |
| SSR-safe (listeners only run on client) | Event naming conventions needed |

### Type-safe event helpers

Define event types in a shared `src/` file to get type safety without sharing runtime state:

```ts
export interface PlaybackTimeUpdateDetail {
  elapsedMs: number
}

export interface PlaybackSeekDetail {
  ms: number
}

export function dispatchTimeUpdate(el: Element, detail: PlaybackTimeUpdateDetail) {
  el.dispatchEvent(new CustomEvent('playback:timeupdate', { bubbles: true, detail }))
}

export function dispatchSeek(el: Element, detail: PlaybackSeekDetail) {
  el.dispatchEvent(new CustomEvent('playback:seek', { bubbles: true, detail }))
}
```

`src/` utility files are inlined at compile time. Type definitions and `CustomEvent` constructors don't carry mutable state, so inlining is safe — each bundle gets its own copy of the helper functions, but they produce identical events.


## Pattern 3: Server-Mediated Props

For state that originates on the server (database, session, URL params), pass it as props from the server route. No client-side sharing needed:

```tsx
import { Player } from '@/components/Player'
import { TimelineBar } from '@/components/TimelineBar'

app.get('/player/:id', async (c) => {
  const track = await db.getTrack(c.req.param('id'))
  return c.render(
    <main>
      <Player trackId={track.id} initialPosition={track.lastPosition} />
      <TimelineBar duration={track.durationMs} />
    </main>
  )
})
```

Each component hydrates independently with its own signals. User interactions that need to cross components use Pattern 2 (custom events).

**When to use:** Initial state comes from the server; components only need to sync on user-driven actions.

| Pros | Cons |
|------|------|
| SSR-friendly — state is in HTML | Real-time sync still needs custom events |
| No shared client state | Server round-trip for state changes |
| Each component is independently testable | |


## Choosing a Pattern

```
Is all state server-derived?
  └─ Yes → Pattern 3 (Server-Mediated Props)
  └─ No
      ├─ Are components tightly coupled (always used together)?
      │   └─ Yes → Pattern 1 (Consolidate Into One File)
      └─ No → Pattern 2 (Custom DOM Events)
```

| | Context (same file) | Consolidate | Custom Events | Server Props |
|---|---|---|---|---|
| Cross-file | No | No (one file) | Yes | Yes |
| Reactive | Yes | Yes | No | No (initial only) |
| Type-safe | Yes | Yes | With helpers | Yes |
| SSR-safe | Yes | Yes | Yes | Yes |
| Testable | IR test | IR test | E2E | IR test + E2E |
