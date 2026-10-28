---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/perl": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/php": patch
"@barefootjs/pebble": patch
---

A `{...props}` spread onto a child component now carries a key its caller passed as `null` or `undefined` on the template adapters, as it does in JS (#3701). `<Tag label="first" {...props} />` called with `{ label: null }` used to keep `"first"` on every template adapter except Hono, because a template reads an omitted prop and a `null` one as the same nil. Each runtime now records the keys the caller passed (`render_child` for a child, `_props` for the root) and answers `bf.passed(name, fallback)` from them; the spread carries a param only when it was passed, so an omitted one still keeps the earlier prop, and a spread that forwards the props object to a child no longer hands it keys the caller left out. With no record (a root rendered without `_props`), the old "not nil" test decides. Templates compiled by this version call `bf.passed`, so they need the runtime of the same version. The Go template adapter still keeps the earlier prop (its Input struct has no record of the passed keys).
