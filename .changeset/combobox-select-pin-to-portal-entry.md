---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Move the `combobox` and `select` render-divergence declarations to `ref-callback-portal-content-inline-at-ssr`, the entry for their remaining SSR portal-position divergence. `nested-child-static-prop-text-slot-elided`, which they cited before, graduates with the `ComboboxValue` / `SelectValue` slot-marker fix.
