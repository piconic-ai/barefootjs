---
"@barefootjs/twig": minor
---

Lower `{...props}` component-spread props on the Twig adapter instead of refusing them with BF101.

Twig hash literals have no splat syntax, so `renderComponent` now builds each child's props dict as an ordered sequence of segments — literal `{k: v, ...}` hash entries and spread expressions — and folds them into one expression via chained `|merge(...)` calls, with later segments winning on key conflict (matching JSX's `{...a, ...b}` / `Object.assign` semantics). A spread operand is routed through the existing `bf.omit(expr, [])` residual helper (introduced for `.map()` object-rest lowering) rather than a bare `?? {}` guard: a request-scoped props bag round-trips through `json_decode` as a PHP `stdClass`, which Twig's `merge` filter rejects outright, while `bf.omit` already normalizes `stdClass` / array / `null` into a plain array `merge` accepts. This mirrors what the ERB adapter already does with Ruby's `**hash` and the Mojolicious adapter with Perl's `%{$props}` — a blind splat that doesn't filter `onXxx`/`ref` keys out of the runtime bag at compile time.

This unblocks the site/ui `Slot` polymorphism pattern (`<Slot className={classes} {...props}>`) used by `badge`, `breadcrumb`, `button`, `button-group`, `icon`, `item`, `kbd`, and `slot` itself, all of which previously failed to compile on Twig. The `button` and `kbd` pins in `conformance-pins.ts` graduate from an expected-BF101 diagnostic contract to real rendered-HTML conformance.
