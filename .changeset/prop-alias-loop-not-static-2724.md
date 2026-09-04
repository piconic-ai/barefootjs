---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Fix #2724: a bare `const x = y` alias hop between a prop and a keyed `.map()` of a child component (`const toggleItems__alias = toggleItems; toggleItems__alias.map(...)`) made the loop's array look, to `isArrayExprDirectPropRef` (jsx-to-ir.ts), like a local constant with no prop/signal origin. The loop was then misclassified `isStaticArray: true` and compiled to the static `qsaChildScopes`-based init path instead of `mapArray`. That static path's `renderChild()` calls carry no `bf-h`/`bf-m` scope-relationship attributes on a pure CSR mount (no existing SSR markup to hydrate against), so the row's child component never got `initChild`ed — its own signals and event listeners never wired up on the CSR-mount leg, even though hydration worked correctly.

`isArrayExprDirectPropRef` now resolves a bare-identifier array expression through its alias-hop chain via the existing shared `resolveAliasOrigin` walker (`props-binding.ts`, already used for the rest/props-spread alias case), recognizing each hop as a direct prop binding either by name or by a `<propsObjName>.<key>` member access read off the constant's structured shape. Kept structural rather than switching to a regex-based check, since the same boolean also feeds `IRLoop.isPropDerivedArray`, which the Go adapter reads to decide whether a nested component's field is literally the loop's prop-sourced data.

Found by the #2481 mutation sweep's `alias-props` mutation against the `toggle-shared` shared fixture.
