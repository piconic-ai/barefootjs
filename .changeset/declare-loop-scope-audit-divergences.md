---
"@barefootjs/twig": patch
"@barefootjs/jinja": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
"@barefootjs/rust": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/go-template": patch
---

Declare the render divergences found by probing the #2482 loop-scope audit's unguarded name-resolution sites: the Twig-family boolean-prop misroute for loop params (#2488) and the `emitSpread` local-const shadow (#2489); ERB's symbol-vs-string dynamic row-key lookup (#2491); and Go's condition-position destructured bindings (#2486), nested-loop `inLoop` clobber (#2487), row-spread attribute-name mangling (#2490), dynamic row-key lookup (#2491), and JS-computed initializer seeding (#2492). Each entry carries its issue URL and graduates when the fix lands.
