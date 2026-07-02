---
"@barefootjs/test": patch
---

Drop unresolvable dynamic interpolation spans (e.g. a `${className}` passthrough) from `TestNode.classes` instead of leaking them as literal `${...}` tokens. `Record<T, string>[key]` indexed lookups already resolve with union semantics (structured `lookup` template part, PR #2000); this cleans the one remaining artifact in the resolved token list so exact-match assertions on `.classes` see only real class tokens.
