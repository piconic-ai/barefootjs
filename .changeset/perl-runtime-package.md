---
"@barefootjs/perl": minor
"@barefootjs/mojolicious": minor
---

Extract the engine-agnostic Perl runtime (`BarefootJS.pm`) into a new
`@barefootjs/perl` package. `@barefootjs/mojolicious` now depends on it and
keeps only the Mojo-specific pieces — `BarefootJS::Backend::Mojo`, the
`Mojolicious::Plugin::BarefootJS` binding, and the compile-time adapter that
emits Embedded Perl (`.html.ep`).

The runtime is Mojo-free at load time and drives any Perl template engine
through a pluggable backend (`encode_json` / `mark_raw` / `materialize` /
`render_named`), with an injectable JSON encoder. SSR output is unchanged for
the Mojolicious path.

Note for consumers that wire Perl `@INC` by hand: `BarefootJS.pm` now ships in
`@barefootjs/perl/lib` rather than `@barefootjs/mojolicious/lib`. Point `@INC`
at both package `lib/` directories (the Mojolicious integration's build does
this automatically).
