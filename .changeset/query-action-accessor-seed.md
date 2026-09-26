---
"@barefootjs/jsx": minor
"@barefootjs/hono": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/jinja": patch
"@barefootjs/blade": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/rust": patch
---

`createQuery`'s action accessors, `action.isPending()` and `action.error()`, are seeded as ordinary, IR-visible values now (`false` / `undefined`, spec/async.md §7.3) instead of refusing with BF117 when read directly in a template position (`aria-busy={fetchPosts.isPending()}`, `{fetchPosts.error() ? <Spinner/> : null}`). A component's pending/error branches render normally on every adapter, including Hono, and `renderToTest` shows both branches structurally. Recognition is structural (fed by `createQuery`'s own binding metadata), shared by BF117's refusal and the seed substitution, and reused unchanged by the upcoming `createMutation` — never a name heuristic.

Calling the action itself (`fetchPosts()`), and a compound or transitive accessor read (through a memo, constant, function, or an aliased action binding), still refuses with BF117 exactly as before; `/* @client */` still works as an escape.

Fixes every non-Hono DSL adapter's (ERB, Mojolicious, Jinja, Blade, Pebble, Twig, Xslate, Rust/minijinja) condition/attribute renderers to lower from the IR's pre-parsed expression tree instead of re-parsing the raw source text, so a recognised accessor's seed substitution survives into their output (previously a `NoMethodError` on ERB, a `use strict` compile error on Mojolicious, and an undefined-in-context member access on the rest, for any expression this pass would otherwise seed). Also fixes the CSR module-scope fallback template's own recognition (used only when no server-rendered markup is present) to match the same shape structurally instead of by raw-text equality, so a parenthesized read (`(fetchPosts.isPending())`) is seeded consistently with the SSR path instead of falling through to an unrelated substitution.
