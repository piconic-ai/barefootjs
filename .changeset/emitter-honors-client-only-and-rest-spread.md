---
"@barefootjs/jsx": patch
---

Fix #2756 and #2754 — two places where a client-side emitter re-decided how a prop is represented instead of reading the answer the shared IR already carries.

#2756: `irToHtmlTemplate` — the builder for keyed-loop rows and conditional branches — passed `honorClientOnly: false` and had no `clientOnly` skip of its own, so it baked a `value="…"` attribute onto a controlled `<textarea>` / `<select>` that `lowerFormControlValueSsr` had already marked `clientOnly` and re-expressed as element content / per-option `selected`. Every SSR adapter omits the attribute, so a row the reconciler rebuilt and a row hydration reused disagreed the moment a row-count change made both coexist in one list. The builder now honours `clientOnly` like the component and CSR template paths do; the row's own effect already owned the value (the loop-row reactive-attr collector has always picked `clientOnly` attrs up), so nothing else moved.

#2754: a component whose only dynamic attribute source is a `{...props}` / `{...rest}` forward got no client-side patch point at all — Phase 1 gave the host element no slot id (a spread trips none of the reactivity heuristics) and `needsClientJs` did not count `restAttrElements`, so `init` was empty and the component fell to the template-only mount. Neither template can carry a bag whose keys are unknown at compile time, so a pure `createComponent` mount silently dropped every caller-supplied attribute — `data-*` hooks, ARIA attributes, test ids — while SSR and hydration looked correct. An unresolved caller-props forward now makes its host element need a slot, and `needsClientJs` counts the rest-attrs application, so `applyRestAttrs` is emitted and addressable. The "does this spread forward the caller's leftover props" walk (including the `const x__alias = props` hop from #2723) is now one exported function, `resolveRestSpreadOriginCore`, shared by the phase that allocates the slot and the phase that emits the call.

An ordinary object spread (`{...someConst}`) is unaffected: it is statically emitted into both templates and still earns no slot.
