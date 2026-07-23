---
"@barefootjs/jsx": patch
---

Fix delegated event handlers silently dropping events when a `bf` slot id collides with a same-id element in an ancestor component (#2367).

Delegated handlers resolved their child slot with an unscoped `target.closest('[bf="sN"]')`. Because `bf` ids are assigned per component, that lookup could climb across component boundaries and match a foreign element in an ancestor scope, taking the wrong branch and dropping the real handler with no error. The match is now gated on `<container>.contains(sNEl)` — the delegating container holds every slot it delegates on, so a same-id ancestor is never a descendant of it and is rejected. Native DOM only; no client-runtime growth.
