---
"@barefootjs/mojolicious": patch
---

Fix `test-render`'s prop materialization for explicit-null props: `typeof null === 'object'` fell through every emission branch, so a `user: null` prop never declared its template var and `Mojo::Template`'s strict mode aborted with "Global symbol requires explicit package name" before the `//` fallback could apply. Null props now declare `my $x = undef`, matching how absent optional params are seeded. Found by the data-point oracle conformance suite (`optional-chaining-prop:null-user`).
