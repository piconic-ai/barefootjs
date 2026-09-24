---
title: Children & Slots
description: Accept nested JSX through the children prop, and let callers choose the rendered element with Slot and asChild.
---

# Children & Slots

Nested JSX arrives in the `children` prop, typed as `Child` — JSX elements, strings, numbers, and arrays of those.

```tsx
function Card(props: { title: string; children?: Child }) {
  return (
    <section className="card">
      <h2>{props.title}</h2>
      {props.children}
    </section>
  )
}
```

```tsx
<Card title="Status">
  <p>All systems go</p>
</Card>
```

Passing `children` on to another component, or wrapping it in a fragment (`<>{props.children}</>`), adds no hydration markers. Compound components such as `Dialog` share state between the root and its children through the [Context API](./context-api.md); lists rendered with `.map()` are covered in [JSX Compatibility](../rendering/jsx-compatibility.md).


## `Slot` and `asChild`

`Slot` renders its child element in place of a tag of its own: it merges `className` (space-separated) and spreads its remaining props onto that child. When the child is not an element (a string, for example), `Slot` falls back to rendering it inside a fragment.

```tsx
// Input
<Slot className="btn" onClick={handleClick}>
  <a href="/home">Home</a>
</Slot>

// Output
<a href="/home" className="btn" onClick={handleClick}>Home</a>
```

A component exposes this through an `asChild` prop. With `asChild`, the caller picks the element and the component contributes its classes and props:

```tsx
import { Slot } from './slot'

function Button({ className, asChild, children, ...props }: ButtonProps) {
  const classes = `btn btn-primary ${className}`

  if (asChild) {
    return <Slot className={classes} {...props}>{children}</Slot>
  }
  return <button className={classes} {...props}>{children}</button>
}
```

```tsx
<Button asChild>
  <a href="/dashboard">Go to Dashboard</a>
</Button>
// Renders: <a href="/dashboard" className="btn btn-primary">Go to Dashboard</a>
```

Use `asChild` for navigation buttons (an `<a>` with button styling), custom dialog or dropdown triggers, and anywhere the caller needs a different semantic element with the component's styling.
