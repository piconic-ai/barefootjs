---
title: /* @client */ Directive
description: Mark JSX expressions for client-only evaluation when the compiler cannot translate them to server templates.
---

# /* @client */ Directive

Marks a JSX expression for **client-only evaluation**. The server renders a placeholder; the browser evaluates the expression at runtime.

```tsx
{/* @client */ expression}
```


## When to Use

The compiler emits `BF021` for expressions it cannot translate to a marked template. `/* @client */` resolves the error by opting into client-only evaluation.

```
error[BF021]: Expression cannot be compiled to marked template

  --> src/components/Dashboard.tsx:15:10
   |
15 |   {items().reduce((sum, x) => sum + x.price, 0)}
   |    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: Add /* @client */ to evaluate this expression on the client only
```

See [JSX Compatibility — Limitations](./jsx-compatibility.md#limitations) for the full list of unsupported patterns.


## How It Works

The compiler skips template generation for the expression. The server outputs a comment marker; the client JS evaluates it:

**Server output:**

```html
<!--bf-client:s2--><!--/-->
```

**Client JS:**

```js
// @client: s2
createEffect(() => {
  updateClientMarker(__scope, 's2', todos().filter(t => !t.done).length)
})
```


## Examples

### Unsupported patterns

```tsx
// Nested higher-order methods
{/* @client */ items().filter(x => x.tags().filter(t => t.active).length > 0)}

// Unsupported array methods
{/* @client */ items().reduce((sum, x) => sum + x.price, 0)}
```

### Explicit client-only evaluation

Even for patterns the compiler supports, you can use `/* @client */` to skip server evaluation. The [TodoApp example](https://github.com/barefootjs/barefootjs/blob/main/examples/shared/components/TodoApp.tsx) uses this approach:

```tsx
// These expressions CAN compile without @client, but the developer
// chose client-only evaluation here
checked={/* @client */ todos().every(t => t.done)}

<strong>{/* @client */ todos().filter(t => !t.done).length}</strong>
```

Compare with the [TodoAppSSR version](https://github.com/barefootjs/barefootjs/blob/main/examples/shared/components/TodoAppSSR.tsx), which omits `/* @client */` and lets the compiler generate marked template equivalents for the same expressions.


## Trade-off

`/* @client */` means **no server-rendered content** for the expression — users see a placeholder until client JS loads. Omit the directive when the compiler can generate a template equivalent to get server-rendered initial values.
