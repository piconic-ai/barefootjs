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

Move the `combobox` and `select` render-divergence declarations from `ref-effect-attr-state-ssr` to `nested-child-static-prop-text-slot-elided`. With `data-placeholder` / `data-selected` now rendered at SSR from the new `showPlaceholder` / `defaultSelected` props, the remaining divergence on these two fixtures is the value text slot. Declared, not fixed here.
