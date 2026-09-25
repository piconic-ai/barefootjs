---
"@barefootjs/router": patch
---

Scroll to the top after a swap instantly. Under a page's `scroll-behavior: smooth`, `window.scrollTo(0, 0)` animated from the previous scroll position, so a navigation from far down a page first showed the new page from mid-way down.
