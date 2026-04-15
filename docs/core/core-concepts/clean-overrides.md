---
title: Clean Overrides
description: CSS Cascade Layers ensure user styles always beat component defaults
---

# Clean Overrides (CSS Layers)

BarefootJS uses CSS Cascade Layers to guarantee that user-supplied classes always override component base classes — no runtime JS, no merge functions, no generation-order concerns.

## Why Layers?

When a component's base classes and a user's override classes have equal specificity, the winner depends on stylesheet generation order. This is fragile.

CSS Cascade Layers solve this: styles in a named `@layer` always lose to un-layered styles, regardless of specificity or source order. BarefootJS puts component base classes into `@layer components`. User-supplied classes remain un-layered:

```css
/* Layer ordering: lowest → highest priority */
@layer preflights, base, shortcuts, components, default;
```

## Compile-Time Prefixing

The compiler's `cssLayerPrefix` option prefixes component base classes at compile time.

### Source

```tsx
const baseClasses = 'inline-flex items-center bg-primary text-primary-foreground'

export function Button({ className = '', children }) {
  return (
    <button className={`${baseClasses} ${className}`}>
      {children}
    </button>
  )
}
```

### Compiled Output (with `cssLayerPrefix: 'components'`)

```tsx
const baseClasses = 'layer-components:inline-flex layer-components:items-center layer-components:bg-primary layer-components:text-primary-foreground'

export function Button({ className = '', children }) {
  return (
    <button className={`${baseClasses} ${className}`}>
      {children}
    </button>
  )
}
```

### Generated CSS

The CSS toolchain (e.g., UnoCSS) sees the `layer-components:` prefix and emits those classes inside `@layer components`:

```css
@layer components {
  .layer-components\:bg-primary { background-color: var(--primary); }
  .layer-components\:text-primary-foreground { color: var(--primary-foreground); }
  /* ... */
}

/* User classes — un-layered, always win */
.bg-red-500 { background-color: #ef4444; }
```

### Cascade Resolution

```
<Button className="bg-red-500">

Applied classes:
  layer-components:bg-primary     → @layer components  (lower priority)
  bg-red-500                      → un-layered          (higher priority)

Result: bg-red-500 wins. Always.
```

## Properties

- **Zero runtime cost** — Prefixing happens at compile time.
- **Works with any CSS tool** — UnoCSS supports the `layer-components:` prefix. Any tool with Cascade Layer support works.
- **No merge function needed** — The CSS cascade handles conflict resolution natively.
- **Language-independent** — Prefixing is applied to the IR, so all adapters benefit equally.
- **Preserves both classes** — Both classes remain in the DOM. DevTools shows what was applied and overridden.

## Configuration

Enable CSS layer prefixing by setting `cssLayerPrefix` in the compiler options:

```typescript
compile(source, {
  cssLayerPrefix: 'components',
  // ...
})
```

For the CSS side, declare the layer order at the top of your global stylesheet:

```css
@layer preflights, base, shortcuts, components, default;
```

See the [UnoCSS integration guide](../adapters/hono-adapter.md) for a full setup example.
