---
"@barefootjs/router": patch
---

After a swap of several sibling regions, focus now moves to the first swapped region that has a heading (falling back to the first swapped region), instead of always the first in document order. A layout can keep its navigation region before its content region — natural tab and landmark order — and focus still lands on the content's heading after a navigation.
