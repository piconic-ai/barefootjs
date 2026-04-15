---
title: Hydration Model
description: Marker-driven hydration that makes server-rendered HTML interactive
---

# Hydration Model

BarefootJS uses **marker-driven** hydration to make server-rendered HTML interactive.

## Hydration Markers

The compiler inserts `bf-*` attributes into the marked template. These tell the client JS where to attach behavior:

| Marker | Purpose | Example |
|--------|---------|---------|
| `bf-s` | Component scope boundary (`~` prefix = child) | `<div bf-s="Counter_a1b2">`, `<div bf-s="~Item_c3d4">` |
| `bf` | Interactive element (slot) | `<p bf="s0">` |
| `bf-p` | Serialized props JSON | `<div bf-p='{"initial":5}'>` |
| `bf-c` | Conditional block | `<div bf-c="s2">` |
| `bf-po` | Portal owner scope ID | `<div bf-po="Dialog_a1b2">` |
| `bf-pi` | Portal container ID | `<div bf-pi="bf-portal-1">` |
| `bf-pp` | Portal placeholder | `<template bf-pp="bf-portal-1">` |
| `bf-i` | List item marker | `<li bf-i>` |

## Hydration Flow

1. The server renders HTML with markers and embeds component props in `bf-p` attributes
2. The browser loads the client JS
3. `hydrate()` finds all uninitialized `bf-s` elements
4. For each scope, the init function runs — creating signals, binding effects, attaching event handlers
5. The runtime tracks the scope internally to prevent double initialization
6. The page is now interactive

```
Server HTML (static)
    ↓
Client JS loads
    ↓
hydrate('Counter', { init: initCounter, template: ... })
    ↓
Find uninitialized <... bf-s="Counter_a1b2">
    ↓
Read props from bf-p attribute
    ↓
Run init(): createSignal, createEffect, addEventListener
    ↓
Track scope as initialized (internal hydratedScopes Set)
    ↓
Page is interactive
```

## Scoped Queries

`$()` and `$t()` search within a scope boundary, excluding nested component scopes.

```html
<div bf-s="TodoApp_x1">        <!-- TodoApp scope -->
  <h1 bf="s0">Todo</h1>            <!-- belongs to TodoApp -->
  <div bf-s="~TodoItem_y1">     <!-- TodoItem scope (~ = child, excluded from TodoApp queries) -->
    <span bf="s0">Buy milk</span>
  </div>
</div>
```

When TodoApp's init calls `$(__scope, 's0')`, it finds the `<h1>`, not the `<span>` inside TodoItem. The `~` prefix on `bf-s` marks a child component scope, which is excluded from parent queries.
