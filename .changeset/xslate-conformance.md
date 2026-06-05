---
"@barefootjs/xslate": minor
"@barefootjs/perl": minor
---

Add `runAdapterConformanceTests` for the Text::Xslate adapter (with a
`renderXslateComponent` test renderer), validated against the same shared
fixture corpus as mojo.

Make the adapter's runtime-helper calls consistent: every JS-semantics-sensitive
value operation goes through a `$bf` method, so the runtime's JS-compat handling
is always applied (rather than a raw Kolon builtin). `.filter` / `.every` /
`.some` / `.find` / `.findIndex` / `.findLast` / `.findLastIndex`,
`.toLowerCase` / `.toUpperCase`, `.join`, and `.length` lower to the
corresponding `$bf` methods — new methods
on the `BarefootJS` runtime in `@barefootjs/perl`. This also fixes a latent bug:
`.length` previously used Kolon's array-only `.size()`, which faults on a string;
`$bf.length` handles both arrays (element count) and strings (char count).

The skip list is verified, not inherited: the six fixtures mojo skips for
Perl-EP scoping faults (`logical-or-jsx`, `nullish-coalescing-jsx`,
`branch-map`, `return-logical-or`, `return-nullish-coalescing`, `return-map`)
all PASS on Xslate, because Kolon resolves variables from the per-render vars
rather than Perl lexicals. `style-object-dynamic` is pinned as a `BF101`
diagnostic (a clean refusal) rather than skipped. Eight fixtures remain skipped
(SSR context, multi-component scope-id harness, Phase-2b `site/ui` primitives),
each confirmed to genuinely fail.
