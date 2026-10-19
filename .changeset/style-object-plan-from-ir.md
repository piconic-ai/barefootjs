---
"@barefootjs/jsx": patch
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

A `style={{ … }}` object is lowered once from the IR's parsed object literal (`planStyleObject` in `@barefootjs/jsx/adapters`) instead of each template adapter re-parsing the attribute text. A shorthand property (`style={{ color, padding }}`) now renders as a CSS string on every adapter instead of failing with BF101. `parseStyleObjectEntries` is removed from `@barefootjs/jsx`.
