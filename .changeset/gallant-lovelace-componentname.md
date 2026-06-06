---
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Honour the fixture `componentName` in the Go / Mojolicious / Xslate SSR test-render harnesses, and graduate the `props-reactivity-comparison` conformance fixture on the Go adapter.

The three SSR test-renderers picked their entry-point IR by default-export → first-exported → first IR, ignoring the requested `componentName`. For a multi-export source (`ReactiveProps.tsx` exports both `ReactiveProps` and `PropsReactivityComparison`) this always rendered the first export, so the `PropsReactivityComparison` fixture compared the wrong component against the Hono reference. Each renderer now selects the IR whose `componentName` matches the requested name first (mirroring the Hono reference's selection), falling back to the previous heuristics for single-export sources.

With the correct component selected, `props-reactivity-comparison` renders byte-for-byte against the Hono reference on **Go** (the generated child constructors compute the `displayValue = props.value * 10` memo from the passed prop), so it is unskipped there.

It stays skipped on **Mojolicious / Xslate**: the child memo `displayValue = props.value * 10` is prop-derived, so `extractSsrDefaults` yields `null` and the Perl SSR model — which seeds child memos from those static defaults — never declares `$displayValue` (Kolon renders it empty; Mojo aborts under strict mode). The skip rationales are refreshed to describe this real failure mode, and the stale `toggle-shared` / `children-jsx-expression` rationales are corrected to match current behaviour (Go drops a hoisted `children={<span/>}` body rather than emitting it as literal text; `toggle-shared`'s loop-child slice types as `[]any` not `[]ToggleItemInput`). Hono reference snapshots are unchanged.
