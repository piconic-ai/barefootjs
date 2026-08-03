---
"@barefootjs/perl": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Fix `BarefootJS::Date` dropping out of the CPAN index.

`BarefootJS-0.30.0` was the first release to ship META `provides` (built by
`Module::Metadata` in `Makefile.PL`). A dist with `provides` makes PAUSE index
from META instead of scanning the `.pm` files, and the two disagree about
inline packages: the file scanner hands every package in a file that file's
`$VERSION`, while `Module::Metadata` reports each package's *own* `$VERSION`.
`BarefootJS::Date`, declared inline in `lib/BarefootJS.pm`, has none — so it
reached PAUSE with a version of `undef`, which compares as *lower* than the
`0.029000` indexed from 0.29.0 and was rejected with "Decreasing version
number". It would have stayed pinned at 0.29.0 through every future release.

`BarefootJS::Date` now carries its own literal `$VERSION`, and
`scripts/sync-perl-versions.ts` bumps every `our $VERSION` line in a module
rather than only the first, so a file holding more than one package stays in
lockstep. That rewrite now also runs unconditionally: it used to sit behind a
skip that reads only the primary module's *first* `$VERSION`, which would have
let a drifted line hide behind an in-sync one indefinitely. The skip now gates
only the once-per-release bookkeeping (the `Changes` entry and the `cpanfile`
pin). A `t/meta_provides.t` in each of the three Perl dists asserts that every
package in META `provides` declares a version and that they all match.
