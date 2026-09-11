---
title: Props Reactivity
description: How prop access patterns determine whether reactive updates propagate in BarefootJS components.
---

# Props Reactivity

**Prop reads stay reactive no matter how you write them.** The compiler wraps dynamic prop
expressions in getters, and every VALUE-POSITION read of a prop — whether written as
`props.xxx` or as a destructured local — compiles to a live read of that getter.


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


## Destructuring

Destructuring is also fully reactive. Every reference to a destructured prop name — in a
`createEffect` body, a `createMemo` computation, an event handler, a reactive attribute,
plain text, anywhere — compiles to the same live read `props.xxx` would:

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


## When To Prefer Which

Both forms behave identically at runtime, so the choice is style, not correctness:

- Destructuring reads naturally and is usually the better default for components with a
  handful of named props.
- `props.xxx` avoids repeating a long prop list at the call site, and is the natural fit for
  a component that mostly forwards its props (`...rest`) rather than naming each one.


## Summary

| Pattern | Reactive? |
|---------|-----------|
| `props.value` | Yes |
| `const { value } = props` (destructured param) | Yes |
| `createSignal(props.value)` | `props.value` is reactive, the signal it seeds is independent thereafter |


## How It Works

The compiler transforms dynamic prop expressions into getters:

```tsx
// Parent
<Child value={count()} />

// Compiled props object
{ get value() { return count() } }
```

`props.value` calls the getter directly. A destructured `value` compiles to the exact same
getter call at every reference site — the compiler rewrites each one, rather than binding a
plain local that would only read the getter once. This is the same reactive-getter model as
SolidJS; unlike SolidJS, BarefootJS performs that rewrite regardless of whether you
destructure, so there is no "don't destructure props" caveat to remember.
