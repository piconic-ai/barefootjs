---
"@barefootjs/go-template": patch
---

Bake an object-literal signal seed into the Props constructor when the signal is typed as a nullable union of an object type or is untyped (#3353). Such a field was seeded `nil`, so every read of a present member, such as `data-name=""` or `data-age="0"`, rendered as absent. The literal now bakes as a map keyed by the source property names: members read as on Hono, an omitted optional member stays absent, and `JSON.stringify` keeps the source keys.
