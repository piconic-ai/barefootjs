---
"@barefootjs/jsx": patch
---

A component literally named `Child` (or any other name that turns `init<Name>` into a `@barefootjs/client/runtime` export, currently only `initChild`) compiled a top-level `export function initChild(...)` into the same client-JS module that also `import { initChild } from '@barefootjs/client/runtime'` — two top-level declarations of the same identifier, a hard `SyntaxError` under real ES module semantics (the same unbundled shape `bf build` ships), so the whole hydration script failed to parse and every action on the page silently broke, not just that component's own reactive content. `initFunctionName` (`ir-to-client-js/utils.ts`) now disambiguates the generated declaration (`initChild$`) whenever it would collide with a runtime import name, computed consistently everywhere the name is declared, registered, called, or located for source-mapping. The bounded state-space exploration scenario `child-prop-slots` is the regression test.
