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

The compiler skips template generation for the expression: the server can never evaluate it, so the SSR-rendered width is always zero. The client claims a slot for it and writes the real value once the browser evaluates the expression — the general case behind both compiled shapes below (`spec/slot-unification.md` §4).

**Claimed slot (the common case):** a marker pair is still emitted so the client has an anchor comment to claim against.

```html
<!-- server output -->
<!--bf:s0--><!--/--> items left
```

```js
// client JS
{ const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'text', path: [] }])
createEffect(() => {
  __bfw_s0('s0', todos().filter(t => !t.done).length)
}) }
```

**Markerless elision (Step B):** when the expression is the ONLY content of its own element — not adjacent to other text/expressions, and not inside a loop or conditional branch — the compiler proves a static child-index path to the slot's position and drops the marker pair entirely from both SSR and CSR output. `<strong>{/* @client */ todos().filter(t => !t.done).length}</strong>` from the [TodoApp example](https://github.com/piconic-ai/barefootjs/blob/main/integrations/shared/components/TodoApp.tsx) qualifies:

```html
<!-- server output -->
<strong bf="s1"></strong>
```

```js
// client JS
{ const __bfw_s0 = lazySlots(__scope, [{ id: 's0', kind: 'text', path: [0, 0], markerless: true }])
createEffect(() => {
  __bfw_s0('s0', todos().filter(t => !t.done).length)
}) }
```

Either way, the claim happens lazily on the first write — nothing is touched until the effect actually runs — and every later write goes through the held reference, never re-scanning the DOM (`packages/client/src/runtime/claim-slots.ts`).


## Examples

### Unsupported patterns

```tsx
// Nested higher-order methods
{/* @client */ items().filter(x => x.tags().filter(t => t.active).length > 0)}

// Unsupported array methods
{/* @client */ items().reduce((sum, x) => sum + x.price, 0)}
```

### Explicit client-only evaluation

Even for patterns the compiler supports, you can use `/* @client */` to skip server evaluation. The [TodoApp example](https://github.com/piconic-ai/barefootjs/blob/main/integrations/shared/components/TodoApp.tsx) uses this approach:

```tsx
// These expressions CAN compile without @client, but the developer
// chose client-only evaluation here
checked={/* @client */ todos().every(t => t.done)}

<strong>{/* @client */ todos().filter(t => !t.done).length}</strong>
```

Compare with the [TodoAppSSR version](https://github.com/piconic-ai/barefootjs/blob/main/integrations/shared/components/TodoAppSSR.tsx), which omits `/* @client */` and lets the compiler generate marked template equivalents for the same expressions.


## Trade-off

`/* @client */` means **no server-rendered content** for the expression — users see a placeholder until client JS loads. Omit the directive when the compiler can generate a template equivalent to get server-rendered initial values.
