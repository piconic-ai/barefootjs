---
title: Props & Type Safety
description: Type component props with TypeScript interfaces and preserve type information through compilation.
---

# Props & Type Safety

The compiler preserves TypeScript type information through compilation. Adapters use it to generate type-safe templates.

Props in client components are reactive — see [Props Reactivity](../reactivity/props-reactivity.md). This page covers typing patterns.


## Defining Props

```tsx
interface GreetingProps {
  name: string
  greeting?: string
}

export function Greeting(props: GreetingProps) {
  return <h1>{props.greeting ?? 'Hello'}, {props.name}</h1>
}
```


## Default Values

Use nullish coalescing (`??`) on the props object:

```tsx
function Button(props: { variant?: 'default' | 'primary'; children?: Child }) {
  const variant = props.variant ?? 'default'
  return <button className={variant}>{props.children}</button>
}
```

For initial-value-only props, default parameter syntax works. Add `@bf-ignore` to suppress the `BF043` destructuring warning:

```tsx
// @bf-ignore props-destructuring
function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = createSignal(initial)
  return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
}
```


## Extending HTML Attributes

Extend HTML attribute types for components wrapping native elements:

```tsx
import type { ButtonHTMLAttributes } from '@barefootjs/jsx'

interface ButtonProps extends ButtonHTMLAttributes {
  variant?: 'default' | 'primary' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
}

function Button(props: ButtonProps) {
  const variant = props.variant ?? 'default'
  const size = props.size ?? 'md'
  const classes = `btn btn-${variant} btn-${size} ${props.className ?? ''}`

  return <button className={classes} {...props}>{props.children}</button>
}
```

Callers can pass standard button attributes (`type`, `disabled`, `aria-label`, etc.) alongside custom props.


## Rest Spreading

Rest spreading captures values once, so use it for server components or non-reactive attributes:

```tsx
function Card(props: { title: string; children?: Child } & HTMLAttributes) {
  return (
    <div className={props.className}>
      <h2>{props.title}</h2>
      {props.children}
    </div>
  )
}
```

```tsx
<Card title="Dashboard" className="shadow-lg" data-testid="dashboard-card">
  <p>Content</p>
</Card>
```


## Type Preservation

The compiler carries TypeScript type information through the IR. Each adapter uses it for type-safe server output. See [Adapters](../adapters.md) for backend-specific type mapping.
