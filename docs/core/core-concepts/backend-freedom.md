---
title: Backend Freedom
description: How adapters let the same JSX run on any server — Hono, Go, and beyond
---

# Backend Freedom

JSX gives you components with props, composition, and type checking. But server rendering with JSX usually means running Node.js on the server.

BarefootJS compiles JSX at build time into your backend's native template format. Go serves `.tmpl` files directly, Hono renders `.hono.tsx` — no Node.js needed at serving time. The compiler produces a backend-agnostic IR, then an adapter converts it:

```
JSX → IR (backend-agnostic) → Adapter → Template
```

| Adapter | Output | Backend |
|---------|--------|---------|
| `HonoAdapter` | `.hono.tsx` | Hono / JSX-based servers |
| `GoTemplateAdapter` | `.tmpl` + `_types.go` | Go `html/template` |

The IR contract is stable. You can [write adapters for any backend](../adapters/custom-adapter.md).
