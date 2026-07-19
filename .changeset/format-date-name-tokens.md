---
'@barefootjs/client': minor
'@barefootjs/jsx': minor
'@barefootjs/go-template': patch
'@barefootjs/erb': patch
'@barefootjs/perl': patch
'@barefootjs/php': patch
'@barefootjs/jinja': patch
'@barefootjs/rust': patch
---

Month/weekday name tokens for date formatting (#2334). `formatDate` gains an explicit `names` table argument (flat 38-slot layout; the `format_date` helper's canonical arity is now 4) and the `MMMM`/`MMM`/`dddd`/`ddd` tokens. The `toLocaleDateString` sugar now admits ANY literal options bag — `{ dateStyle: 'long', timeZone: 'UTC' }`, `{ weekday: 'short', … }` — probing it at build time and shipping the derived pattern plus the name table into the compiled output as an ordinary array argument, so backends stay locale-data-free (type-only) and no runtime ICU/CLDR exists anywhere. Unreproducible forms (era, dayPeriod, 2-digit year, narrow names, non-latn digits) keep refusing loudly per the fidelity rule: reproduce the user's TSX exactly or decline, never approximate.
