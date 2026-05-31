---
"@barefootjs/hono": patch
---

`renderHonoComponent` (`@barefootjs/hono/test-render`) can now load child components as real pre-compiled modules via a new `componentModules` option (import specifier → module path), re-anchoring the parent's import instead of inlining + stripping the child's exports. This avoids text surgery on the child's `export` statements entirely for callers that supply pre-compiled modules.

The inline `components` path (used when no module is supplied) also hardens its export stripping: whole `export { … }` / `export type { … }` specifier blocks — with or without a trailing `from '…'` re-export source — are now dropped cleanly instead of collapsing to a bare `type { … }` syntax error.
