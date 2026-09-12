---
title: Props Reactivity
description: How prop access patterns determine whether reactive updates propagate in BarefootJS components.
---

# Props Reactivity

**`props.xxx` access, destructuring the props parameter, and destructuring the props object
inside the function body are all equally reactive.** The compiler wraps dynamic prop
expressions in getters, and every value-position read of a prop — written any of the three
ways — compiles to a live read of that getter.


## Direct Access

`props.xxx` maintains reactivity. Each access calls the underlying getter:

```tsx
function Display(props: { value: number }) {
  createEffect(() => {
    console.log(props.value) // Re-runs when parent updates value
  })
  return <span>{props.value}</span>
}
```


## Destructuring In The Parameter

Destructuring the props **parameter** is also fully reactive. Every reference to a
destructured prop name — in a `createEffect` body, a `createMemo` computation, an event
handler, a reactive attribute, plain text, anywhere — compiles to the same live read
`props.xxx` would:

```tsx
function Display({ value }: { value: number }) {
  createEffect(() => {
    console.log(value) // Re-runs when parent updates value
  })
  return <span>{value}</span>
}
```

There is no local variable holding a stale, captured-at-mount copy — `value` above compiles
to a live read of the parent's getter at every reference site, the same as `props.value`
would. A destructure default (`{ value = 0 }`) is evaluated live too: it re-applies on every
read, not just once at mount.


## Destructuring In The Body

Destructuring inside the function body is also fully reactive, as long as the destructured
name is a **pure alias** of a single prop — nothing computed from it:

```tsx
function Display(props: { value: number }) {
  const { value } = props
  createEffect(() => {
    console.log(value) // Re-runs when parent updates value
  })
  return <span>{value}</span>
}
```

The compiler recognizes `const { value } = props` (and the equivalent `const value =
props.value`) as a pure passthrough, drops the local extraction entirely, and rewrites every
reference to `value` to a live `props.value` read instead — the same rewrite the parameter
form gets. A destructure default (`const { value = 0 } = props`) and a renamed binding
(`const { value: v } = props`) are both covered the same way.

This does NOT apply once the local does its own computation, or is reassigned:

```tsx
function Display(props: { value: number }) {
  const { value } = props
  const doubled = value * 2 // `doubled` is an ordinary once-evaluated local
  let { count } = props
  count += 1               // `count` is reassigned, so it can't be a live alias either
  return <span>{doubled}</span>
}
```

`doubled` is a real computation, not a passthrough — it is an ordinary local, evaluated once
at its declaration (same as it would be with any other access pattern). A `let` binding is
never treated as a live alias, since rewriting a later assignment to it would mean silently
writing through to the caller's prop.


## When To Prefer Which

The three reactive forms — `props.xxx`, parameter destructuring, and body destructuring —
behave identically at runtime, so the choice between them is style, not correctness:

- Destructuring (parameter or body) reads naturally and is usually the better default for
  components with a handful of named props.
- `props.xxx` avoids repeating a long prop list at the call site, and is the natural fit for
  a component that mostly forwards its props (`...rest`) rather than naming each one.


## Summary

| Pattern | Reactive? |
|---------|-----------|
| `props.value` | Yes |
| `function C({ value }: Props)` — parameter destructuring | Yes |
| `const { value } = props` — body destructuring (pure alias) | Yes |
| `const doubled = value * 2` — a computation, not a pure alias | No, evaluated once at declaration (same as any other once-evaluated local) |
| `createSignal(props.value)` | `props.value` is reactive, the signal it seeds is independent thereafter |


## How It Works

The compiler transforms dynamic prop expressions into getters:

```tsx
// Parent
<Child value={count()} />

// Compiled props object
{ get value() { return count() } }
```

`props.value` calls the getter directly. A `value` destructured in the PARAMETER, or aliased
by a pure body destructure, compiles to the exact same getter call at every reference site —
the compiler rewrites each one, rather than binding a plain local that would only read the
getter once. This is the same reactive-getter model as SolidJS; unlike SolidJS, BarefootJS
performs that rewrite for both the parameter form and the body-alias form, so there is no
"don't destructure props" caveat left — only the ordinary rule that a real computation
(`value * 2`) is evaluated once, same as it would be anywhere else in the function.
