---
"@barefootjs/jinja": minor
---

New Python backend adapter targeting Jinja2. `JinjaAdapter` ports the Xslate (Kolon) adapter's IR lowering to Jinja2 syntax (`{{ … }}` / `{% if %}` / `{% for %}` / `{% set %}`), and the package bundles a Python runtime (`packages/adapter-jinja/python/barefootjs/`) — a port of the Perl `BarefootJS` runtime with a `JinjaBackend` implementing the engine backend contract (`encode_json`, `mark_raw`, `materialize`, `render_named`) on an autoescaping `jinja2.Environment`. Templates call the same snake_case `bf.<helper>` surface as the Perl adapters, with `bf.truthy` / `bf.mod` covering JS-vs-Python semantic divergences.
