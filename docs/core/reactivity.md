---
title: Reactivity
description: Fine-grained reactive primitives inspired by SolidJS, including signals, effects, memos, and lifecycle hooks.
---

# Reactivity

All reactive primitives are imported from `@barefootjs/client`:

```tsx
import { createSignal, createEffect, createMemo, onMount, onCleanup, untrack } from '@barefootjs/client'
```

## API Reference

| API | Description |
|-----|-------------|
| [`createSignal`](./reactivity/create-signal.md) | Create a reactive value |
| [`createEffect`](./reactivity/create-effect.md) | Run side effects when dependencies change |
| [`createMemo`](./reactivity/create-memo.md) | Create a cached derived value |
| [`onMount`](./reactivity/on-mount.md) | Run once on component initialization |
| [`onCleanup`](./reactivity/on-cleanup.md) | Register cleanup for effects and lifecycle |
| [`untrack`](./reactivity/untrack.md) | Read signals without tracking dependencies |

## Guides

- [Props Reactivity](./reactivity/props-reactivity.md) — How props stay reactive, and when destructuring breaks it
