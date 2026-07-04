---
"@barefootjs/jsx": minor
"@barefootjs/go-template": minor
"@barefootjs/mojolicious": minor
"@barefootjs/xslate": minor
"@barefootjs/perl": minor
"@barefootjs/erb": minor
"@barefootjs/jinja": minor
"@barefootjs/twig": minor
"@barefootjs/rust": minor
---

Lower array-index / nested / rest destructure `.map()` callback params on all template adapters (#2087, refs #2069).

`LoopParamBinding` gains a structured `segments` path (field/index steps with `isIdent` classification) and the shared gate — renamed `isLowerableLoopDestructure`, old name kept as a deprecated alias — now admits fixed bindings at any path depth (`([k, v])`, `{ cells: [head] }`, `{ user: { name } }`), array-rest (`[first, ...tail]`, lowered as the exact slice), and object-rest used as member access or as a `{...rest}` spread onto an intrinsic element (lowered as a true residual bag via a new per-adapter `omit` runtime helper feeding the existing `spread_attrs` pipeline; ERB uses native `Hash#except`).

The `rest-destructure-{object-spread,array,nested}-in-map` conformance fixtures graduate from BF104 pins to real-engine HTML comparison on all seven template adapters, alongside the new `destructure-array-index-in-map` / `destructure-nested-object-in-map` fixtures. Still refused (BF104): bare value uses of an object-rest name, spreads onto components/providers, `.filter().map(destructure)` chains, and `__bf_`-prefixed binding names.

Collateral hardening: `static-array-from-props(-with-component)`'s destructure no longer trips BF104, which exposed an orthogonal gap — a loop array bound to a computed function-scope const would silently render empty. Template adapters now raise a narrow BF101 for that shape instead.
