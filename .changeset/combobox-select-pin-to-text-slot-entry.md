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

Move the `combobox` and `select` render-divergence declarations from `ref-effect-attr-state-ssr` to `nested-child-static-prop-text-slot-elided`. `data-placeholder` / `data-selected` now render at SSR from the new `showPlaceholder` / `defaultSelected` props, so `ref-effect-attr-state-ssr` no longer lists these fixtures, and each fixture is listed on only one registry entry. Their portal-position divergence is unchanged. Declared, not fixed here.
