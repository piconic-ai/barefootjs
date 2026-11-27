---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
"@barefootjs/shared": patch
---

An attribute written after an open spread now overrides the spread's value for that attribute when the bag holds it under a React-style key: `<label {...rest} htmlFor="y">` with `rest.htmlFor` set renders one `for="y"` on Hono, where it rendered `for="f" for="y"` before. This also applies to the other keys Hono renames in a spread (`httpEquiv`, `crossOrigin`, `itemProp`, `fetchPriority`, `noModule`, `formAction`) and to a key that spells the attribute in another letter case (`tabIndex` beside a later `tabIndex={3}`). Hydration no longer re-applies the bag's value over the later attribute, and the client template renders the attribute once. A later expression that evaluates to `undefined` now removes the bag's value, as JSX does. The template adapters still render both values for an open bag; that case is tracked in the known-limitation registry.
