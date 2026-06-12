---
"@barefootjs/router": minor
---

Add press-based prefetch. The router now prefetches a link's page on primary `pointerdown` (mouse/touch/pen) — the highest-intent, lowest-waste signal, firing tens of ms before `click` — in addition to hover and focus. `pointerdown` also covers touch, replacing the separate `touchstart` trigger. Non-primary presses (e.g. right-click) don't prefetch.
