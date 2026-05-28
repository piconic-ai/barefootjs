---
"@barefootjs/client": patch
---

Fix two mapArray bugs (#1627):

- Hydration now removes orphaned SSR nodes when the client signal has fewer items than the server rendered.
- Components created via `createComponent` (the CSR path mapArray takes for new loop items post-hydration) now thread their own scope id into `_parentScopeId`, so child components rendered by `renderChild` get parent-prefixed `bf-s`/`bf-h`/`bf-m` markers. This lets the component's init resolve them via `$c(scope, 'sN')` and wire up event handlers, matching the SSR convention.
