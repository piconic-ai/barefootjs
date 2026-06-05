# @barefootjs/perl

The engine-agnostic **Perl runtime** for [BarefootJS](https://barefootjs.dev) —
the `BarefootJS` module (`BarefootJS.pm`) that compiled marked templates call as
the `bf` helper (`bf->json(...)`, `bf->spread_attrs(...)`, the array/string
method helpers, hydration markers, child-component rendering).

This package depends **only on core Perl** (subroutine signatures + a tiny
hand-rolled accessor base). Everything that depends on *how* a template is
rendered — JSON marshalling, raw-string marking, JSX-children materialisation,
and named-template rendering — is delegated to a pluggable **backend**, so the
same runtime can drive any Perl template engine / web framework.

```
JSX → IR → (compile-time adapter) → marked template ─┐
                                                      ├─► rendered by the host's
  BarefootJS runtime ── backend ── template engine ───┘    template engine
```

## Backend contract

A backend implements four methods:

| Method | Purpose |
|--------|---------|
| `encode_json($data)` | JSON-encode a value (injectable; e.g. `Cpanel::JSON::XS`) |
| `mark_raw($str)` | Mark a string so the engine emits it without re-escaping |
| `materialize($value)` | Resolve a captured-children ref to a string |
| `render_named($name, $bf, \%vars)` | Render a named template with `$bf` bound |

Inject a backend with `BarefootJS->new($c, { backend => $b })`.

## Reference implementation

[`@barefootjs/mojolicious`](../adapter-mojolicious) provides
`BarefootJS::Backend::Mojo` (Mojolicious / `Mojo::Template`) plus the
`Mojolicious::Plugin::BarefootJS` binding and the compile-time adapter that
emits Mojolicious Embedded Perl (`.html.ep`).

## CPAN

The CPAN distribution name is `BarefootJS`. The npm package ships the same
`lib/` so the monorepo integrations can consume it without a separate install.

## Tests

```sh
prove -lv t/
```

The tests run with core Perl only (no Mojolicious required) by injecting a
pure-Perl `JSON::PP` backend.
