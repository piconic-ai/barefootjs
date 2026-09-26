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

`createQuery`'s action accessors, `action.isPending()` and `action.error()`, are now seeded as ordinary, IR-visible values (`false` / `undefined`, spec/async.md §7.3) at the template positions where the seed renders exactly like the Hono reference. Before, a read of either accessor in a template position was refused with BF117. Two positions are seeded:

- a conditional test, for either accessor: `{fetchPosts.error() ? <Spinner/> : null}`;
- an ARIA boolean-state attribute on an intrinsic element, for `isPending()` only: `aria-busy={fetchPosts.isPending()}`.

A component's pending and error branches render normally on every adapter, including Hono, and `renderToTest` shows both branches structurally. Recognition is structural: it is fed by `createQuery`'s own binding metadata, not by a name heuristic. One gate decides both the seed and BF117's refusal, and the upcoming `createMutation` reuses it unchanged.

Every other read still refuses with BF117, because the seed would diverge from Hono there. `/* @client */` still works as an escape. The reads that still refuse:

- a text child (`{fetchPosts.error()}`);
- `error()` in any attribute;
- `isPending()` in a non-ARIA-boolean attribute;
- a structured template attribute's ternary;
- calling the action itself (`fetchPosts()`);
- a compound or transitive read through a memo, constant, function or aliased action binding.

Eight non-Hono DSL adapters now lower conditions and attributes from the IR's pre-parsed expression tree instead of re-parsing raw source text: ERB, Mojolicious, Jinja, Blade, Pebble, Twig, Xslate and Rust/minijinja. This is what lets a seeded accessor reach their output.
