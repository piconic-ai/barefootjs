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

A `.filter(pred).map(…)` loop whose predicate has no template form (a conditional, a template literal, an object literal, a standalone arrow or regex) now fails with BF101 on every template adapter. Before, the loop filter stood a truthy constant in for the predicate and rendered every row. Add `/* @client */` to evaluate such a filter in the browser.
