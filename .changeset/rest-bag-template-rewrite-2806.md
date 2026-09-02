---
"@barefootjs/jsx": patch
---

Fix #2806: a component reading its own rest-bag spread directly in JSX (`{rest.header}`, not spread onto an element's attrs via `{...rest}`) emitted a CSR template referencing the bare, unbound `rest` identifier — a guaranteed `ReferenceError`. The rest binding is `_p` at runtime (the init body already rewrites `rest.x` → `_p.x` via `rewritePropsObjectRef`, #2723, and `applyRestAttrs` excludes the consumed keys by name from that same object rather than constructing a narrower one), but the four CSR/static template builders in `html-template.ts` were calling `rewritePropsObjectRef` with `null` for the rest name — the same four sites #2737 just migrated onto this shared door for `propsObjectName`. They now thread `ctx.restPropsName` through as well, so a direct rest-bag read resolves the same way in the template as it always did in init.
