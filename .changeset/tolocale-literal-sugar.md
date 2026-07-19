---
'@barefootjs/jsx': minor
---

Literal-locale `toLocaleDateString` sugar (#2324 slice 2): `date.toLocaleDateString('ja-JP', { timeZone: 'UTC' })` on a `Date`-typed prop — with a compile-time-literal locale and an explicit `'UTC'`/`±HH:MM` timeZone — now compiles. The compiler resolves the locale's default date pattern once at build time and lowers to the existing `format_date` helper on the SSR path and to `formatDate(...)` on the client-JS path, so output is byte-identical across all backends and the browser with no runtime ICU anywhere. Implicit-environment shapes (zero-arg, locale-only, runtime locale, IANA zone names) keep refusing with BF021, whose message now points at the explicit-input forms.
