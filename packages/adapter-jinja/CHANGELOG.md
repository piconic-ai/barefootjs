# @barefootjs/jinja

## 0.1.0

### Minor Changes

- Add `@barefootjs/jinja` — a Jinja2 adapter that compiles BarefootJS IR to
  `.jinja` templates and ships the Python `barefootjs` rendering runtime
  (bundled under `python/`). Because the rendering backend is a plain
  `jinja2.Environment`, it runs under any Python web framework (Flask,
  etc.) — no framework-specific glue required.

  Near-mechanical port of `@barefootjs/xslate`'s Text::Xslate (Kolon)
  adapter to Jinja2 syntax (`<: X :>` → `{{ X }}`, `<: X | mark_raw :>` →
  `{{ X | safe }}`, `$bf.m(...)` → `bf.m(...)`, `: if (C) { ... : }` →
  `{% if C %}...{% endif %}`, `: for $arr -> $x { ... : }` → `{% for x in
  arr %}...{% endfor %}`, `: my $x = e;` → `{% set x = e %}`), with the
  JS-semantics divergences between Perl and Python handled by uniform
  runtime-routed policies rather than per-fixture hacks: JS-faithful
  truthiness (`bf.truthy`, since Python's `[]`/`{}` are falsy but JS's are
  truthy — Perl references don't have this problem), JS-compatible
  stringification at every text/attribute interpolation (`bf.string` /
  `bf.bool_str`, since Python's `str()` diverges further from JS
  `String()` than Perl's does), reserved-word identifier mangling
  (`lib/jinja-naming.ts`), and an evaluator-JSON-only higher-order-callback
  lowering (Jinja has no lambda expression, unlike Kolon's `-> $x { … }`
  fallback).
