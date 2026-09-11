---
title: Props Reactivity
description: How prop access patterns determine whether reactive updates propagate in BarefootJS components.
---

# Props Reactivity

**`props.xxx` access and destructuring the props parameter are equally reactive.** The
compiler wraps dynamic prop expressions in getters, and every value-position read of a prop
— written either way — compiles to a live read of that getter. Destructuring inside the
function body is the one form that still captures once.


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


## Destructuring In The Body — Captures Once

Destructuring inside the function body is a different thing, and it is **not** reactive:

```tsx
function Display(props: { value: number }) {
  const { value } = props // calls the getter ONCE, stores the number
  return <span>{value}</span> // never updates
}
```

This is an ordinary local binding, so it behaves the way it does in SolidJS. Use the
parameter form, or read `props.value` at the point of use.


## When To Prefer Which

The two reactive forms — `props.xxx` and parameter destructuring — behave identically at
runtime, so the choice between them is style, not correctness:

- Destructuring reads naturally and is usually the better default for components with a
  handful of named props.
- `props.xxx` avoids repeating a long prop list at the call site, and is the natural fit for
  a component that mostly forwards its props (`...rest`) rather than naming each one.


## Summary

| Pattern | Reactive? |
|---------|-----------|
| `props.value` | Yes |
| `function C({ value }: Props)` — parameter destructuring | Yes |
| `const { value } = props` — body destructuring | No, captured once |
| `createSignal(props.value)` | `props.value` is reactive, the signal it seeds is independent thereafter |


## How It Works

The compiler transforms dynamic prop expressions into getters:

```tsx
// Parent
<Child value={count()} />

// Compiled props object
{ get value() { return count() } }
```

`props.value` calls the getter directly. A `value` destructured in the PARAMETER compiles to
the exact same getter call at every reference site — the compiler rewrites each one, rather
than binding a plain local that would only read the getter once. (A `const { value } = props`
in the body is just that plain local, which is why it does not update.) This is the same
reactive-getter model as SolidJS; unlike SolidJS, BarefootJS performs that rewrite for the
parameter form, so the "don't destructure props" caveat only applies to the body form.
