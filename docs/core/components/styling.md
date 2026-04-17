---
title: Style Overrides
description: How user-supplied classes override component base classes via CSS Cascade Layers
---

# Style Overrides

User-supplied classes always override component base classes — guaranteed by CSS Cascade Layers. No runtime JS, no merge functions, no class-order concerns.

Styles in a named `@layer` lose to un-layered styles regardless of specificity. BarefootJS puts component base classes into `@layer components`:

```css
@layer preflights, base, shortcuts, components, default;
```

The compiler's `cssLayerPrefix` option prefixes base classes at compile time:

```tsx
// Source
const baseClasses = 'inline-flex items-center bg-primary text-primary-foreground'

// Compiled (cssLayerPrefix: 'components')
const baseClasses = 'layer-components:inline-flex layer-components:items-center layer-components:bg-primary layer-components:text-primary-foreground'
```

User classes remain un-layered and always win:

```
<Button className="bg-red-500">

  layer-components:bg-primary     → @layer components  (lower priority)
  bg-red-500                      → un-layered          (higher priority)

Result: bg-red-500 wins.
```

Zero runtime cost. Prefixing applies to the IR, so all adapters benefit.
