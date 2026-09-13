---
"@barefootjs/go-template": patch
---

Fixes #2925: a local signal/memo getter passed to a plain child component's prop (`<Display value={count} />`, and identically `<Display value={{ v: count }} />`) compiled clean but rendered the field as Go's zero value — `NewCounterProps`'s constructor-time build of the nested `DisplayInput{...}` literal silently omitted `Value` instead of baking `5`.

Root cause: the static constructor baker (`resolveDynamicPropValue`) only recognized the *called* getter form (`count()`); a bare, uncalled getter name matched no branch and the field was dropped. The object-literal-wrapped shape had a second, independent gap: `ChildComponentShape` only tracked *optional* object-typed child params for the map-literal bake path, but a *required* anonymous-object prop (`value: { v: () => number }`) lowers to a synthesized Go struct (#2674), not a map.

Both shapes now resolve through the same constructor-time seeding a signal/memo's own top-level field already uses, and a required object-typed child param's struct-vs-map target is resolved from a shared naming decision (`planSynthPropStructs`) instead of guessed.
