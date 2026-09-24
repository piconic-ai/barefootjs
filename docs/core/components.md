---
title: Components
description: How to author, compose, and type components, including props, children, context, and portals.
---

# Components

A component is a function that returns JSX. The `"use client"` directive that makes one interactive is explained in [Component Authoring](./components/component-authoring.md).

```tsx
export function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}</h1>
}
```

## Pages

| Topic | Description |
|-------|-------------|
| [Component Authoring](./components/component-authoring.md) | Server vs. client components, composition, props, refs |
| [Children & Slots](./components/children-slots.md) | The `children` prop, `Slot`, and `asChild` |
| [Context API](./components/context-api.md) | `createContext` / `useContext`; sharing state across files |
| [Portals](./components/portals.md) | Rendering elements outside their parent DOM hierarchy |
| [Style Overrides](./components/styling.md) | User classes override base classes via CSS Cascade Layers |
