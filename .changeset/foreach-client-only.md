---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Give `.forEach()` a dedicated unsupported-method diagnostic and tighten the generic BF101 wording (#1448 Tier C).

`.forEach()` returns `undefined`, so it is never a template-position lowering target — its only meaningful use is side effects inside event handlers / `createEffect` callbacks (client JS, which never reaches the adapter). The template-language adapters already refuse it in template position via the parser's `UNSUPPORTED_METHODS` gate (surfaced as BF101); this swaps the generic hint for a `forEach`-specific reason that explains the `undefined` return and points to `.map(...)` / `createEffect` instead.

The generic BF101 reason for other unlowerable methods is also reworded to lead with the SSR-preserving fix and frame `/* @client */` as an escape hatch with its cost made explicit: `'<method>()' can't render on the server. Pre-compute the value, or add /* @client */ for client-only (no SSR).` These reasons are flagged `selfContained` on the `SupportResult`, so the Go-template adapter shows them as-is instead of appending its own "Options" block — which would have duplicated the remedies and, for `forEach`, contradicted the tailored message. Low-level reasons (operators, comparators, complex predicates) stay un-flagged, so the adapter still attaches its remediation options and users never lose actionable next steps.

No behaviour change for the client-callback path: `.forEach()` inside event handlers / `createEffect` continues to pass straight through to the emitted runtime. A regression test pins both halves of the contract.
