---
"@barefootjs/jsx": patch
---

Route JSX-returning `.flatMap()` expression bodies through the structured-segments carrier. Previously `items.flatMap(t => t.tags.map(tag => <li key={...}>{tag}</li>))` (the unbraced twin of the supported block-body form) fell through to the scalar expression path and spliced raw JSX verbatim into the client bundle — invalid JS, so the whole component silently failed to hydrate. Also adds a structural net (any map-like callback with an inline JSX literal that produces no loop lowering now refuses loudly instead of leaking) and an adapter gate for segment-carried flatMap bodies on DSL backends (BF021 + `/* @client */` instead of an empty SSR loop body).
