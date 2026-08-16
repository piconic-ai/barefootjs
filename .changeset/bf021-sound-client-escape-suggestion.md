---
"@barefootjs/jsx": patch
---

BF021's diagnostic no longer recommends a bare `/* @client */` as an escape for a method call on a host rich-typed prop (`Date`, `Map`, …) — following it compiled clean but crashed at hydrate with a `TypeError`, since the prop crosses the `bf-p` boundary as JSON with no type-aware revival. The suggestion now leads with pre-computing the value server-side, and for `Date`/`URL` (the two types whose `toJSON()` output round-trips through their own constructor) offers a genuinely hydrate-safe `/* @client */` form that explicitly revives the receiver first, e.g. `new Date(createdAt).toISOString()`.
