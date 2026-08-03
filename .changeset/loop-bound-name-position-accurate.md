---
"@barefootjs/twig": patch
"@barefootjs/jinja": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
"@barefootjs/rust": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
---

Fix a `.map()` callback param that shares a boolean-typed or nullable-optional prop's name being misclassified in attribute position: the row's string value was routed through the boolean/nullable-optional lowering (rendering "true"/"false", or gaining a spurious null guard) instead of the row's own value. The five Twig-family adapters (twig, jinja, blade, xslate, rust/minijinja) gain a position-accurate, ref-counted `loopBoundNames` map — ported from the ERB/Mojolicious adapters, which already had the map but were missing the guard at these two call sites. All seven adapters now check loop-bound position before routing through the boolean/nullable-optional lowering (#2488).
