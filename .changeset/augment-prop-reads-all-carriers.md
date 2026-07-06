---
"@barefootjs/jsx": patch
---

`augmentInheritedPropAccesses` (the shared pass every template-stash adapter runs) now sees `props.X` reads carried by dynamic text children (`<p>{props.label}</p>`), conditional / if-statement conditions (`{props.show && …}`), loop array expressions (`(props.items ?? []).map(…)`), and child-component prop values. Previously these reads were invisible for an untyped `props` parameter, so the emitted SSR template referenced a variable the generated props type / manifest `ssrDefaults` never declared — a strict-mode 500 on the Perl-family adapters and a missing struct field on Go (#2126 follow-up). Text reads keep the default `string` classification; condition / loop-array reads land in the nillable bucket. A new cross-adapter conformance fixture (`untyped-props-reads`) renders these shapes with no props on every adapter against the Hono reference.
