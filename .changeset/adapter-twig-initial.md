---
"@barefootjs/twig": minor
---

New PHP backend adapter targeting Twig. `TwigAdapter` ports the Jinja2 adapter's IR lowering to Twig syntax (`{{ … }}` / `{% if %}` / `{% elseif %}` / `{% for %}` / `{% set %}`), and the package bundles a PHP runtime (`packages/adapter-twig/php/`) — a port of the Perl `BarefootJS` runtime with a `TwigBackend` implementing the engine backend contract (`encode_json`, `mark_raw`, `materialize`, `render_named`) on an autoescaping `Twig\Environment`. Escaped-entity byte forms differ from markupsafe (`&quot;` vs `&#34;`) but are canonicalized by the conformance harness. Templates call the same snake_case `bf.<helper>` surface as the Perl/Python adapters, with `bf.truthy` / `bf.eq` / `bf.neq` covering JS-vs-PHP semantic divergences (PHP truthiness, and PHP's `==`/`===` not matching JS strict equality).
