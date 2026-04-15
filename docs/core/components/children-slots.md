---
title: Children & Slots
description: Accept nested JSX content via the children prop and enable polymorphic rendering with the Slot component.
---

# Children & Slots

Nested JSX content is passed via the `children` prop. The `Slot` component enables polymorphic rendering with `asChild`.


## Children

```tsx
<Card>
  <h2>Title</h2>
  <p>Body text</p>
</Card>
```

```tsx
function Card(props: { children?: Child }) {
  return <div className="card">{props.children}</div>
}
```

`children` is typed as `Child`, which covers JSX elements, strings, numbers, and arrays.


## Passing Children Through

```tsx
function Panel(props: { title: string; children?: Child }) {
  return (
    <section>
      <h2>{props.title}</h2>
      <div className="panel-body">{props.children}</div>
    </section>
  )
}
```

Wrapping `children` in a fragment (`<>{props.children}</>`) is **transparent** — the compiler skips the fragment without extra hydration markers. See [Fragment](../rendering/fragment.md).


## The `Slot` Component

`Slot` merges props and classes onto its child element, enabling the **`asChild` pattern**:

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

### How `Slot` Works

`Slot` extracts the child's tag, merges `className` (space-separated), spreads remaining props, and renders the child's tag with the merged result.

```tsx
// Input
<Slot className="btn" onClick={handleClick}>
  <a href="/home">Home</a>
</Slot>

// Output
<a href="/home" className="btn" onClick={handleClick}>Home</a>
```

If `children` is not a valid element (e.g., a string), `Slot` falls back to rendering it inside a fragment.


## The `asChild` Pattern

`asChild` delegates rendering to the child element — the component's styling without its default HTML tag.

### Default rendering (no `asChild`)

```tsx
<Button variant="primary">Click me</Button>
// Renders: <button className="btn btn-primary">Click me</button>
```

### With `asChild`

```tsx
<Button variant="primary" asChild>
  <a href="/dashboard">Go to Dashboard</a>
</Button>
// Renders: <a href="/dashboard" className="btn btn-primary">Go to Dashboard</a>
```

The `<a>` tag receives Button's classes and props. The component controls styling; the caller controls the element.

### When to Use `asChild`

- Navigation buttons (render `<a>` with button styling)
- Custom triggers (dialog or dropdown)
- Semantic elements with reused component styles

```tsx
// Dialog trigger as a custom element
<DialogTrigger asChild>
  <span role="button" tabIndex={0}>Open</span>
</DialogTrigger>
```


## Compound Components

```tsx
<Dialog open={open()} onOpenChange={setOpen}>
  <DialogTrigger>Open</DialogTrigger>
  <DialogOverlay />
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm</DialogTitle>
      <DialogDescription>Are you sure?</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose>Cancel</DialogClose>
      <Button onClick={handleConfirm}>Yes</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Sub-components read shared state from a context provider. See [Context API](./context-api.md).


## List Rendering

```tsx
{todos().map(todo => (
  <TodoItem
    key={todo.id}
    todo={todo}
    onToggle={() => handleToggle(todo.id)}
    onDelete={() => handleDelete(todo.id)}
  />
))}
```

`key` is required for efficient list updates (warning `BF023` if missing).
