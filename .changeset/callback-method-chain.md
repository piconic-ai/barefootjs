---
'@barefootjs/jsx': patch
'@barefootjs/blade': patch
'@barefootjs/erb': patch
'@barefootjs/go-template': patch
'@barefootjs/jinja': patch
'@barefootjs/mojolicious': patch
'@barefootjs/pebble': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/xslate': patch
---

A template expression whose `.map` / `.filter` / `.reduce` (or other higher-order) callback reads its index or array parameter, such as `items.map((x, i) => i)`, now fails with BF101 on the DSL adapters. Before, the index was read from an unrelated template variable of the same name, or left undefined. Add `/* @client */` to evaluate it on the client.

The DSL adapters lower higher-order callbacks through one shared chain in `@barefootjs/jsx` (`lowerCallbackMethod`). Its BF101 messages now read the same on every adapter apart from the adapter's name. ERB and Mojolicious used different wording, and the Rust adapter called itself "Jinja".
