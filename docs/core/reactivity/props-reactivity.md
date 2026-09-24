---
title: Props Reactivity
description: Every way of reading a prop — props.x, parameter destructuring, body destructuring — compiles to a live read.
---

# Props Reactivity

`props.x`, destructuring the parameter, and destructuring `props` in the body are equally reactive. The parent passes dynamic props as getters, and the compiler turns every read of a prop — written any of the three ways — into a live call of that getter.

```tsx
"use client"
import { createEffect } from '@barefootjs/client'

export function Display({ value }: { value: number }) {
  createEffect(() => {
    console.log(value) // re-runs when the parent updates value
  })
  return <span>{value}</span>
}
```

Body destructuring (`const { value } = props`), a default (`{ value = 0 }`), a rename (`{ value: v }`), and a rest spread (`{ value, ...rest }`, read as `rest.x`) all compile to the same live read.

| Pattern | Reactive? |
|---------|-----------|
| `props.value` | Yes |
| `function C({ value }: Props)` — parameter destructuring | Yes |
| `const { value } = props` — body destructuring | Yes |
| `const label = props.value + '!'` — a computed local | No, evaluated once at declaration |
| `createSignal(props.value)` | The read is live, but it seeds the signal once |

## Gotchas

- A computed local (`const label = props.value + '!'`) or a `let` binding is evaluated once, like any other local. Derive it with [`createMemo`](./create-memo.md) or compute it inline in JSX.
- `createSignal(props.value)` copies the prop once; later parent updates do not reach the signal. Read the prop directly unless you mean to seed local state (see [Effects run during hydration](./create-effect.md#effects-run-during-hydration)).
