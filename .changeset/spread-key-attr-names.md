---
"@barefootjs/shared": patch
"@barefootjs/jsx": patch
"@barefootjs/pebble": patch
---

A spread bag key now renders with the attribute name the Hono reference gives it. Pebble's `spread_attrs` renamed no key, so an open rest bag's `className` rendered as `className="..."`; it now renames the same eight React-style keys Hono does (`className` → `class`, `htmlFor` → `for`, `crossOrigin`, `httpEquiv`, `itemProp`, `fetchPriority`, `noModule`, `formAction`) and writes every other key as it is. On every template adapter, a closed rest spread (`{...rest}` whose keys come from the props type) or a local object const spread rendered `htmlFor` (and the other six names) as written, renaming only `className`; the expanded keys now go through the same shared table (`SPREAD_KEY_ATTR_NAMES` in `@barefootjs/shared`).
