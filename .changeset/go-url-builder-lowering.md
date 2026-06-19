---
"@barefootjs/go-template": minor
---

Lower `hrefFor`-style URL-builder helpers to `bf_query`, and compute derived string consts as struct fields (PostList href blocker, #1897 follow-up — Capability C2).

A call to a local URL-builder helper — `href={sortHref('date')}` where `sortHref` delegates to `hrefFor = (sort, tag) => { const u = new URLSearchParams(); if (sort !== 'date') u.set('sort', sort); if (tag) u.set('tag', tag); return u.toString() ? \`${root}?${u}\` : root }` — previously lowered to `{{.SortHref "date"}}`, a method call with no Go method behind it. The adapter now:

- Recognizes the `URLSearchParams` builder idiom (AST) and emits a `bf_query` action, lowering each guarded `.set()` to an `(include bool, key, value)` triple — the guard via the existing condition lowering (`if (sort !== 'date')` → `ne … "date"`; `if (tag)` → `ne … ""`). Pass-through delegates (`sortHref` → `hrefFor`) are inlined and recursed.
- Computes component-scope derived string consts that the template references (e.g. `root = base || '/'`, with `base = (props.base ?? '').replace(/\/+$/, '')`) as `NewXxxProps`-initialized struct fields. `(…).replace(/\/+$/, '')` lowers to `strings.TrimRight(_, "/")` (this trailing-slash pattern only), `||` to an empty-fallback, and `props.X` to `in.X`; `strings` is added to the generated imports when used.

Verified end-to-end against the shared blog `PostList`: `.SortHref` / `.TagHref` are gone, `Root` is computed, and the emitted Go renders correct URLs (`/blog?sort=title&tag=go`, trailing-slash bases normalized).
