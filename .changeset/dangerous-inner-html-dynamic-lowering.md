---
'@barefootjs/jsx': minor
'@barefootjs/blade': minor
'@barefootjs/erb': minor
'@barefootjs/go-template': minor
'@barefootjs/jinja': minor
'@barefootjs/rust': minor
'@barefootjs/mojolicious': minor
'@barefootjs/twig': minor
'@barefootjs/xslate': minor
---

Dynamic `dangerouslySetInnerHTML={{ __html: expr }}` now lowers on every template adapter (#2319, successor to #2215). A prop-/signal-derived `__html` value is serialized by the adapter and emitted through that language's runtime raw-output sink — Blade `{!! !!}`, ERB unescaped `<%= %>`, Go `template.HTML` via the new `bf_raw_html` helper, Jinja/MiniJinja `| safe`, Twig `| raw`, Mojolicious `<%== %>`, Xslate `mark_raw` — instead of refusing with BF101. The value is evaluated at request time and never spliced into template source, so no template-metacharacter guard applies, matching React's "dangerously = the caller owns the value's safety" contract and the existing Hono/CSR behavior. The compile-time string-literal case (#2207) is unchanged; a value that is not a `{ __html: … }` object literal still refuses with BF101.
