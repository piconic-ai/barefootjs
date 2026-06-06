---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Drop the vestigial `@barefootjs/perl` npm dependency from the Mojolicious and Xslate adapters. The TS adapters never import the Perl runtime as JS — `BarefootJS.pm` is resolved at the Perl layer (each `cpanfile`'s `requires 'BarefootJS'` for CPAN consumers, and `prove -I ../adapter-perl/lib` / a cpanm-installed core in CI), while the TS `test-render` locates it through a relative `../../adapter-perl/lib` path. Version lock-step is already guaranteed by the changesets `fixed` group, so the npm dependency carried no weight. Keeping it made the generated JSR manifests reference a `jsr:@barefootjs/perl` that will never exist on JSR (the Perl distribution ships `lib/*.pm`, no TS exports) and pulled a JS-less package into npm installs.

The JSR publish script (`scripts/jsr-publish.ts`) now also only emits a `jsr:` specifier for scoped siblings that are themselves JSR-published, so a future cross-language sibling can't silently re-introduce a dangling import.
