# @barefootjs/rust

## 0.1.0

### Minor Changes

- Add `@barefootjs/rust` — a minijinja adapter that compiles BarefootJS IR to
  `.j2` templates and ships a Rust `barefootjs` rendering runtime (bundled
  under `runtime/`). Because the rendering backend is a plain
  `minijinja::Environment`, it runs under any Rust web framework (axum,
  actix-web, warp, bare `hyper`, etc.) — no framework-specific glue required.

  Near-verbatim port of `@barefootjs/jinja`'s Jinja2 adapter to the
  `minijinja` Rust crate — the emitted template syntax is IDENTICAL
  (`{{ X }}`, `{{ X | safe }}`, `bf.m(...)`, `{% if C %}...{% endif %}`,
  `{% for x in arr %}...{% endfor %}`, `{% set x = e %}`, `{'k': v}` dict
  literals), verified compatible against minijinja 2.21.0 (`ChainableUndefined`
  behavior, `trim_blocks`/`lstrip_blocks`, autoescape, `{% set %}...{% endset %}`
  capture blocks, `~` concat, `| safe`, custom `Object` method calls, and
  Python-like truthiness all confirmed equivalent). Only identity fields
  differ (`name: 'minijinja'`, `extension: '.j2'`, class `MinijinjaAdapter`)
  plus the render engine that interprets the syntax (a Rust
  `minijinja::Environment` instead of Python's `jinja2.Environment`), via a
  custom minijinja formatter that absorbs the remaining JS-semantics
  divergences uniformly (MarkupSafe-compatible `&#39;` escaping, JS-shaped
  number formatting, `true`/`false` bool literals).
