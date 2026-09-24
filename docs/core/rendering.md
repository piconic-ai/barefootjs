---
title: Templates & Rendering
description: What JSX the compiler accepts, and how to defer one expression to the client.
---

# Templates & Rendering

Standard JSX compiles to a server template plus client JS; one directive defers an expression to the browser.

```tsx
{/* @client */ items().reduce((sum, x) => sum + x.price, 0)}
```

| Page | Description |
|------|-------------|
| [JSX Compatibility](./rendering/jsx-compatibility.md) | What compiles, and each adapter's limits |
| [`/* @client */` Directive](./rendering/client-directive.md) | Skip server evaluation |
