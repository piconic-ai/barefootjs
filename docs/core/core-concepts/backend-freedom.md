---
title: Backend Freedom
description: How adapters let the same JSX run on any server — Hono, Go, and beyond
---

# Backend Freedom

JSX gives you components with props, composition, and type checking. But server rendering with JSX usually means running Node.js on the server.

BarefootJS compiles JSX at build time into your backend's native template format. Go renders `.tmpl` with `html/template`; Perl renders `.html.ep` with Mojolicious; Hono renders the generated `.tsx`. For non-Node backends, no Node.js runs at serving time. The compiler produces a backend-agnostic IR, then an adapter converts it:

```
JSX → IR (backend-agnostic) → Adapter → Template
```

| Language | Adapter | Notes |
|----------|---------|-------|
| TypeScript | [HonoAdapter](../adapters/hono-adapter.md) | Hono / JSX-based TS servers |
| TypeScript | [TestAdapter](https://github.com/barefootjs/barefootjs/tree/main/packages/test) | IR-based component testing |
| Go | [GoTemplateAdapter](../adapters/go-template-adapter.md) | `html/template` |
| Perl | [MojoliciousAdapter](https://github.com/barefootjs/barefootjs/tree/main/packages/mojolicious) | Mojolicious EP templates |

### Planned

| Language | Adapter |
|----------|---------|
| Rust | (TBD) |
| Python | Jinja2Adapter |
| Ruby | ERBAdapter |

The IR contract is stable. You can [write a custom adapter](../adapters/custom-adapter.md) for any backend.
