---
title: /* @client */ Directive
description: Mark JSX expressions for client-only evaluation when the compiler cannot translate them to server templates.
---

# /* @client */ Directive

The `/* @client */` comment directive marks a JSX expression for **client-only evaluation**. The server renders a placeholder; the browser evaluates the expression at runtime.

```tsx
{/* @client */ expression}
```


## When to Use

When the compiler encounters an expression it cannot translate to a marked template, it emits a **compile error** (`BF021`). Adding `/* @client */` resolves the error by explicitly opting into client-only evaluation.

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

With `/* @client */`, the compiler skips marked template generation for the expression. The server outputs a comment marker and the client JS evaluates the expression entirely:

**Server output:**

```html
<!--bf-client:slot_5-->
```

**Client JS:**

```js
// The expression is evaluated on the client and inserted into the DOM
insert(scope, 'slot_5', () => todos().filter(t => !t.done).length)
```


## Examples

### Unsupported patterns

Patterns that the compiler cannot translate to marked templates require `/* @client */`:

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

`/* @client */` means the expression has **no server-rendered content** — the user sees the placeholder until client JS loads and evaluates. Use it only when the compiler cannot generate a marked template equivalent. For expressions that the compiler can handle, omit the directive to get server-rendered initial values.
