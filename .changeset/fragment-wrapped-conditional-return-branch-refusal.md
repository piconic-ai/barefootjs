---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

A component whose multi-return `if`/`else` chain has a branch wrapped in a bare JSX fragment (`return <>…</>`, no wrapping element) now refuses to compile with `BF029` whenever that branch hydrates, which is when the component is `'use client'` or the fragment branch renders a child component the parent must initialize. This replaces silently shipping a branch whose events never bind after hydrating existing server HTML. `ComponentDef`'s comment-scope flags are decided once per component, not per branch, so the client can't tell which branch needs the comment-scope boundary; SSR and a fresh client mount were already correct, only claiming existing SSR markup during hydration missed it. Wrap the branch in a real element instead of a bare fragment, or add `/* @client */` immediately before the fragment to compile it anyway and accept the known hydration gap.
