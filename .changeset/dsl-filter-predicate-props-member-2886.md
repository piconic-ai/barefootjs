---
"@barefootjs/mojolicious": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
"@barefootjs/rust": patch
---

Fix #2886: a `.filter()`/`.find()`/etc. predicate reading a bare-props-form prop DIRECTLY as a member access (`props.hiddenId`, no local destructure) rendered divergent from the Hono reference on every DSL adapter — the same shape of bug fixed for the Go Template adapter in #2879. Each adapter's filter `member()` emitter lacked the `props.x` flattening its own non-filter `member()` sibling already had, so `props` itself fell through to the generic member-access path as an ordinary identifier: Mojolicious/Xslate emitted an undeclared/nil variable (a hard runtime error under Perl `use strict`, or a silent nil-comparison keeping every row), ERB raised `NoMethodError` on `nil[...]`, and Jinja/Twig/Blade/minijinja silently kept every row instead of filtering (a null/undefined comparison never matches).

Fixed by extracting a `flattenPropsMember` helper in each adapter's `expr/emitters.ts` (mirroring the flattening logic already in that adapter's non-filter `member()` emitter) and calling it from both the filter and non-filter `member()` emitters, closing the one-decision-two-implementations gap. Unpinned the shared `filter-predicate-props-member` conformance fixture (added in #2887) in all seven `render-divergences.ts` files, verified against each adapter's real interpreter (Perl/Mojolicious, Perl/Text::Xslate, Ruby/ERB, Python/Jinja2, PHP/Twig, PHP/Blade, and the Rust minijinja binary) — confirmed each adapter reproduces its own reported failure without the fix and passes with it.
