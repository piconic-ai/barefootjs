---
"@barefootjs/router": patch
---

Hard-navigate instead of swapping when the region id sets diverge and the incoming page's first region is not a root. Previously a live single-region page navigating to a page with sibling regions (e.g. a sidebar-less layout → a layout with a sidebar region) swapped the incoming sidebar's markup into the live page region.
