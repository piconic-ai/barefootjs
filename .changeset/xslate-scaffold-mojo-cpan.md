---
"@barefootjs/cli": minor
---

create-barefootjs: install the Mojolicious scaffold's BarefootJS deps from CPAN (declared in `cpanfile` via `Mojolicious::Plugin::BarefootJS` + `BarefootJS`) instead of vendoring `.pm` copies under `lib/`, and add a new `xslate` adapter (`--adapter xslate`) that scaffolds a plain Plack/PSGI app rendering Kolon `.tx` templates through `BarefootJS::Backend::Xslate`.
