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

Drop the `combobox` and `select` render-divergence declarations. Both fixtures now render byte-identical to the Hono reference on every template adapter: `data-placeholder` / `data-selected` render at SSR from the new `showPlaceholder` / `defaultSelected` props, the `ComboboxValue` / `SelectValue` text slot keeps its SSR markers, and the SSR portal content renders in the same place as the reference.
