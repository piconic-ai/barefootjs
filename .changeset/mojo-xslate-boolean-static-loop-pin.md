---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

No behavior change. Documents a pre-existing, permanent limitation (#2911) in each adapter's own `conformance-pins.ts`: a `boolean` value anywhere inside a static loop array's item shape keeps the whole array unbakeable (`staticValueToPerl` deliberately refuses to serialize a boolean, since Perl has no boolean literal), surfaced by a new conformance fixture added alongside the Go template adapter's #2898/#2893 fixes.
