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

A renamed body destructure binding whose default passes a callback to a call (`const { b: local = ['y', ''].filter((x) => x !== '') } = props`) now renders its value in the client template. The template reads it as the prop with its default (`_p.b ?? (…)`), the same read the parameter form `function C({ b: local = … })` gets, in text, attributes, conditions, loop sources and child props. Before, a pure client-side mount rendered an empty value, a missing attribute, the wrong branch or no loop rows. A child component whose prop is such a read (renamed or not) now renders in the client template instead of being deferred to init. A body destructure binding that is reassigned or mutated after its declaration (`let { b: local = null } = props; local = ['changed']`), renamed or not, is no longer read as the prop: the client template leaves its read empty and defers a child that receives it to init, instead of rendering the child with the prop's value. Two gaps remain and are recorded as limitations: a read only through a memo (`destructure-default-callback-memo-read`), and, on every template adapter but the Hono reference (Blade, erb, Go, Jinja, MiniJinja, Mojolicious, Pebble, Twig and Xslate), a callback default that reads no earlier prop, which they render without its default (`destructure-default-callback-unseeded`).
