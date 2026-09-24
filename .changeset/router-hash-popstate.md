---
"@barefootjs/router": patch
---

A `popstate` that changes only the URL hash no longer triggers a navigation. Browsers fire `popstate` when a same-page `#anchor` link is followed and on back/forward between such entries; the router treated it as a route change, re-fetched the displayed page, swapped it back in (resetting island state) and scrolled to the top, undoing the anchor jump.
