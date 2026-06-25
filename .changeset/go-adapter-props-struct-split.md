---
"@barefootjs/go-template": patch
---

Split the Go adapter's `generatePropsStruct` into focused private field emitters (readability). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `emitPropsStructHeader` — the fixed `ScopeID` / `Bf*` / `Scripts` / `SearchParams` fields.
- `emitPropsDataFields` — prop, signal, and memo fields (owns the shared `propFieldNames` de-dup set so a signal/memo sharing a prop's name doesn't redeclare the field).
- `emitPropsAuxFields` — derived-const, `useContext`-consumer, nested-component-array, static-child, and spread-bag fields.

`generatePropsStruct` drops from ~190 lines to a 5-line orchestration.
