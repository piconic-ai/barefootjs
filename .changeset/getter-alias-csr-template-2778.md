---
"@barefootjs/jsx": patch
---

Fix #2778: a local `const` alias of a signal or memo getter (`const items__alias = items`) was substituted as the literal `undefined` in the CSR template instead of following the alias to the getter's initializer/computation — `(undefined)().map(...)` is a guaranteed `TypeError` the moment a component using this shape pure-CSR-mounts (SSR and hydration were unaffected, since only the module-scope `template:` lambda takes this path).

The alias binding is not a value copy — `items__alias` IS `items` for CSR-substitution purposes — so `resolveGetterAliases` (`csr-substitute.ts`, built on a new shared `resolveAliasOrigin` hop-walker generalized out of `props-binding.ts`'s existing rest/props-alias resolver) registers the alias as the SAME call-kind substitution entry its origin has in `buildSignalMemoEnv`, so `items__alias()` is substituted by the exact mechanism that already substitutes `items()` correctly, through every hop of a multi-hop chain (`const a = items; const b = a`). `compute-inlinability.ts`'s `classifyConstantInitial` and `populateCsrInlinable` both consult the same alias set, so a two-hop alias no longer trips a spurious BF061 diagnostic that a one-hop alias didn't.

Also files #2813 (a separate, SSR-side "one decision, two implementations" gap this investigation surfaced): every non-Hono adapter fails to render the same aliased-loop-source shape, since each resolves the loop's array-source identifier by name lookup against seeded/struct data keyed by the signal's real name, with no alias-hop resolution — pinned per-adapter (`render-divergences.ts`) with the new `aliased-loop-source` conformance fixture until fixed.
