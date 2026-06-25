---
"@barefootjs/go-template": patch
---

Extract the Go html/template adapter's spread-bag codegen into `spread/spread-codegen.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `spread/spread-codegen.ts` — the ten spread / object-map codegen methods moved out as free functions, with two exported entry points (`collectSpreadSlots`, `buildSpreadInitializer`) and eight module-local helpers (`classifySpreadBagSource`, `collectSpreadSlotsRecursive`, `parseJsObjectLiteralToGoMap`, `buildConditionalSpreadInitializer`, `unwrapParens`, `conditionToGoBool`, `objectLiteralToGoSpreadMap`, `recordIndexAccessToGoMap`). They read only `state.restPropsName` / `state.usesFmt` and `parseLiteralExpression`; no new `GoEmitContext` member.
- Removes the now-unused `parseRecordIndexAccess` import from the adapter (its last caller moved into the module).
