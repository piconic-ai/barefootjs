---
"@barefootjs/twig": patch
"@barefootjs/jinja": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
"@barefootjs/rust": patch
"@barefootjs/erb": patch
---

Fix a loop-scope resolution bug found by the #2482 audit. `elementAttrEmitter.emitSpread`'s local-const fallback resolved a bare spread identifier against `localConstants` with no loop-shadow check, so a `.map()` row like `<p {...attrs} />` spread the OUTER `const attrs = ...` instead of the per-row value. The fallback now consults the live `loopBoundNames` map and skips local-const resolution for a name currently bound by an enclosing loop, mirroring the Mojolicious adapter's existing guard (#2489).
