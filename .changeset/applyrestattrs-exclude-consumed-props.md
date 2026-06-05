---
"@barefootjs/jsx": patch
---

Fix `applyRestAttrs` exclude list to key on consumed prop names instead of
HTML attribute names. For components that destructure props and spread
`...rest`, the generated exclude list now unions the destructured param
names (the JS rest-exclusion set) with the statically-set attribute names.
This prevents hydration from double-binding separately-wired event handlers
(e.g. `onInput`/`onChange` firing twice) and from re-emitting consumed props
(e.g. `error`, `describedBy`, `variant`, `size`) as raw DOM attributes.
