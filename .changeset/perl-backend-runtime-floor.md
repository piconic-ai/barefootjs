---
"@barefootjs/xslate": patch
"@barefootjs/mojolicious": patch
---

Fix #2305: the Xslate and Mojolicious CPAN dists declared `requires
'BarefootJS'` without a version floor (Xslate) or with a stale one
(Mojolicious, 0.15.0), so CPAN testers with an older BarefootJS runtime
failed at render time with `Can't locate object method "scope_comment_end"`
(added in 0.21.0). Both cpanfiles now require BarefootJS 0.21.0, and
`scripts/sync-perl-versions.ts` bumps the floor to the dist's own version on
every release — the Perl dists ship from one fixed changeset group, so the
same-version floor always exists on CPAN and the declaration can never fall
behind the runtime methods that generated templates call.
