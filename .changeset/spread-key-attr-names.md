---
"@barefootjs/shared": patch
"@barefootjs/jsx": patch
"@barefootjs/pebble": patch
---

A spread bag key now renders with the attribute name the Hono reference gives it. Pebble's `spread_attrs` renamed no key, so an open rest bag's `className` rendered as `className="..."`; it now renames the same eight React-style keys Hono does (`className` → `class`, `htmlFor` → `for`, `crossOrigin`, `httpEquiv`, `itemProp`, `fetchPriority`, `noModule`, `formAction`) and writes every other key as it is. On every template adapter, a closed rest spread (`{...rest}` whose keys come from the props type) or a local object const spread rendered `htmlFor` (and the other six names) as written, renaming only `className`; the expanded keys now go through the same shared table (`SPREAD_KEY_ATTR_NAMES` in `@barefootjs/shared`).

The last write of a renamed key now wins exactly once. A literal written before an open spread (`<label htmlFor="x" {...rest}>`) is dropped when the bag carries `htmlFor` (also `className`, `httpEquiv`, and on Pebble, whose spread helper renames all eight, `crossOrigin` and the rest; adapters declare this as `TemplateAdapter.spreadKeyRenames`), instead of rendering two `for` attributes of which a browser keeps the literal. A literal written after a closed rest spread (`<label {...rest} htmlFor="x">`, also `className`) drops that key from the spread's expansion, so the element renders `for="x"` once; a client-only (`/* @client */`) attribute after the spread, which the server does not render, leaves the rest's value in place, and a later repeat of the rest carries an earlier write as its fallback, across an open spread only where that bag lacks the key, so a value the bag supplies is not masked.
