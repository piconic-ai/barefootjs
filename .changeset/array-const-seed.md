---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

A memo or signal over a component-scope array const (`const local = ['y', 'z']; createMemo(() => local.length)`) now renders the value JS computes on every template adapter, instead of an empty value or `0`. A derived seed whose value the static evaluator cannot resolve is no longer treated as constant, so the template computes it; the evaluator reads `.length` of a resolved array or string; and a component-scope array const that holds a prop-derived element (`[items.length, tag]`) is inlined where a template reads it. A read of an array const that spreads an element (`[...b, 'z']`) is refused with BF101 instead of reading an unbound name.
