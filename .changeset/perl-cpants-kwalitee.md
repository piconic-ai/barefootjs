---
"@barefootjs/perl": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Fix CPANTS Kwalitee issues flagged on the published CPAN dists (cpants.cpanauthors.org):

- `no_pod_errors` — `BarefootJS::DevReload`'s POD used an em dash before
  declaring `=encoding utf8`, which `Test::Pod`/CPANTS parse as a raw
  non-ASCII byte in POD. Added the missing `=encoding utf8`.
- `consistent_version` — `BarefootJS::Evaluator` and `BarefootJS::SearchParams`
  were stuck at `0.14.0` because `scripts/sync-perl-versions.ts` only listed
  `BarefootJS.pm` and `DevReload.pm` for the `packages/adapter-perl` dist, so
  releases never bumped their `$VERSION`. Both are now synced with the rest of
  the distribution, and the script tracks them going forward.
- `meta_yml_has_provides` — plain `ExtUtils::MakeMaker` (unlike Module::Build
  or Dist::Zilla) does not auto-populate META's `provides`. Each `Makefile.PL`
  now builds it via `Module::Metadata->provides`.
- `has_security_doc` / `security_doc_contains_contact` / `has_contributing_doc`
  — the repository's root `SECURITY.md`/`CONTRIBUTING.md` were never part of
  the packaged CPAN tarballs (only files listed in each dist's `MANIFEST` are
  shipped). Copied both into each Perl dist directory, same as the existing
  `LICENSE` copies, and added them to `MANIFEST`.
