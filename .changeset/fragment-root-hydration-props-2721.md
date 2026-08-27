---
"@barefootjs/client": patch
---

Fix #2721: hydrating a fragment-rooted client component (`return <>...</>`) read its own props as `{}` regardless of what SSR actually serialized. `hydrateCommentScope` (runtime/hydrate.ts) unwrapped the comment's JSON with `parsed[name] ?? {}`, assuming a `{ [componentName]: props }` shape that no emitter produces — `wrapWithScopeComment` (adapter-hono) always writes the scope's own props flat, exactly like `bf-p` does for an element-scoped root. The bug was invisible whenever a fragment root had no props to serialize (`{}` was already correct by luck), which is why it survived until the mutation sweep exercised a fragment-wrapped component whose props actually mattered — e.g. a `toggleItems` array silently becoming `[]` at hydration, which then made `mapArray`'s "client has fewer items than SSR rendered" cleanup delete every SSR-rendered row.

Fixed by reading the parsed JSON directly, matching `hydrateElementScope`'s equivalent `bf-p` read.
