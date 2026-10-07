---
"@barefootjs/go-template": patch
---

Bake an object-literal signal seed into the Props constructor when the signal is typed as a nullable union of an object type or is untyped (#3353). Such a field was seeded `nil`, so every read of a present member, such as `data-name=""` or `data-age="0"`, rendered as absent. The literal now bakes as the named struct when the union's object branch is a local struct type, and otherwise as a capitalized-key `map[string]interface{}`, which `bf_get` reads the same way.
