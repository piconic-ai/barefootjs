---
"@barefootjs/xslate": minor
"@barefootjs/perl": minor
---

Add `runAdapterConformanceTests` for the Text::Xslate adapter (with a
`renderXslateComponent` test renderer), validated against the same shared
fixture corpus as mojo.

Make the adapter's runtime-helper calls consistent: every helper is now either
a `$bf` method or a Kolon builtin — no bare `bf_*` / `grep_*` functions.
`.filter` / `.every` / `.some` and `.toLowerCase` / `.toUpperCase` lower to
`$bf.filter` / `$bf.every` / `$bf.some` / `$bf.lc` / `$bf.uc` (new methods on the
`BarefootJS` runtime in `@barefootjs/perl`), and `.join` uses Kolon's builtin
`.join` array method (whose `undef`→empty semantics match JS). The Xslate
backend no longer registers any custom Kolon `function` map.

The skip list is verified, not inherited: the six fixtures mojo skips for
Perl-EP scoping faults (`logical-or-jsx`, `nullish-coalescing-jsx`,
`branch-map`, `return-logical-or`, `return-nullish-coalescing`, `return-map`)
all PASS on Xslate, because Kolon resolves variables from the per-render vars
rather than Perl lexicals. `style-object-dynamic` is pinned as a `BF101`
diagnostic (a clean refusal) rather than skipped. Eight fixtures remain skipped
(SSR context, multi-component scope-id harness, Phase-2b `site/ui` primitives),
each confirmed to genuinely fail.
