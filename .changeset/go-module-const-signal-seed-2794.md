---
"@barefootjs/go-template": patch
---

Fix #2794: a signal seeded from a bare identifier referencing a module-level const (`const PAYLOAD = 'hello'; createSignal(PAYLOAD)`) baked to `nil` in the generated `New<Component>Props` constructor instead of the const's literal value — the analyzer types this signal `unknown` (it never chases an identifier to its declaration), so none of `convertInitialValue`'s typed branches ever saw it. `resolveModuleStringConst` already existed on the adapter for exactly this resolution (used by `template-interp.ts` for live template expressions) but wasn't wired into the signal-baking path; it's now checked in `convertInitialValue`'s bare-identifier branch, after the destructured-prop lookup so a same-named prop still shadows the const.

Also fixes the same gap for numeric (`resolveModuleNumericConst`, which existed but wasn't exposed on the adapter's emit-context seam) and boolean (`resolveModuleBooleanConst`, newly added) module consts — the identical resolver-not-wired shape on two more literal kinds, filed and fixed together as #2815 rather than left as a follow-up. The three-way `.find(` lookup they'd otherwise each need is shared through one `findModuleConst` helper, keeping `binding-scope-ratchet.test.ts`'s shrink-only floor for this file flat.

Graduates the `textarea-row-breakout` render-divergence pin.
