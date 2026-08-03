---
"@barefootjs/perl": patch
"@barefootjs/mojolicious": patch
---

Ship the full test suite in the Perl CPAN tarballs.

Only MANIFEST-listed files are packaged, and `make test` runs `t/*.t` off the
working tree — so a test missing from MANIFEST passes in CI forever while never
once running for a CPAN tester. Seven had accumulated in the `BarefootJS` dist
(`eval_vectors`, `evaluator`, `omit`, `props_attr`, `query`, `render_child`,
`scope_comment`) and one in `Mojolicious-Plugin-BarefootJS` (`scope_comment`).
All eight are now listed.

Each was checked against what a CPAN tester actually has: every dependency is
either core or already declared in the dist's `cpanfile`, and no test reads a
monorepo path at runtime. `t/eval_vectors.t` reads golden vectors from
`packages/adapter-tests/`, which is monorepo-only, but guards them with
`plan skip_all` exactly as the already-shipped `t/helper_vectors.t` does.
`Mojolicious-Plugin-BarefootJS`'s `t/scope_comment.t` carries a
`use lib "$Bin/../../adapter-perl/lib"` for monorepo runs; a missing directory
is a no-op for `lib.pm`, and `requires 'BarefootJS'` resolves the module from
`@INC` instead.

Two CI checks in `ci-perl-dist.yml` keep this true. One fails if any `t/*.t` is
absent from its dist's MANIFEST. The other extracts each built tarball outside
the checkout and runs its suite there — the working-tree run has the whole
monorepo on disk, so a shipped test that reaches outside its own dist passes
there and only fails for a real user.
