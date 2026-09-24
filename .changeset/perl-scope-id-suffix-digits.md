---
"@barefootjs/perl": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Generate the random part of a Perl-side scope id (`<Template>_<suffix>`) as six digits. The old form stringified `rand()` and stripped its leading `0.`, which failed whenever Perl printed a small value in exponent form (`3.2247e-05`), so an id could come out as `TableRow_3.2247` with a `.` in it. The runtime, the Mojolicious plugin and both Perl test harnesses now share `BarefootJS::scope_id_suffix()`.
