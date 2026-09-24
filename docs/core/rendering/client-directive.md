---
title: /* @client */ Directive
description: Mark one JSX expression for client-only evaluation when an adapter cannot render it on the server.
---

# /* @client */ Directive

Marks a JSX expression for client-only evaluation: the server skips it and emits an empty slot, and the client fills the slot after hydration.

```tsx
{/* @client */ expression}
```

## When to use it

- An expression a template-language adapter refuses with [BF021 or BF101](../advanced/error-codes.md#bf101) — a `.reduce()`, a nested `.some()` in a predicate, an imperative comparator. See [Adapter limits](./jsx-compatibility.md#adapter-limits).
- A value that must be computed in the browser (`window`, `localStorage`, …).

## Example

[TodoApp](https://github.com/piconic-ai/barefootjs/blob/main/integrations/shared/components/TodoApp.tsx) defers its derived counts even though the compiler could template them:

```tsx
<strong>{/* @client */ todos().filter(t => !t.done).length}</strong>
```

[TodoAppSSR](https://github.com/piconic-ai/barefootjs/blob/main/integrations/shared/components/TodoAppSSR.tsx) omits the directive, and the server renders the same expression:

```tsx
<strong>{todos().filter(t => !t.done).length}</strong>
```

## Trade-off

Nothing is server-rendered for that region: the user sees an empty slot until client JS runs. Omit the directive wherever the compiler can template the expression, and prefer a precomputed prop when the value is known on the server.

`"use client"` at the top of a file marks the whole component as interactive; `/* @client */` is expression-level and only changes where that one expression is evaluated.
