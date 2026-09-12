---
"@barefootjs/jsx": patch
---

Fixes `stopPropagation()` called inside a `.map()` row's event handler not stopping a sibling handler the row's static container itself carries for the same event (#2930). `.map()` rows compile via event delegation — a single `addEventListener` on the loop's container resolves `event.target` back to the row — so when the container ALSO carries its own directly-authored handler for the same event, both used to become separate `addEventListener` calls on the identical DOM node, and native `stopPropagation()` cannot stop another listener already registered on the same node (only bubbling to other nodes). The container's own handler is now folded into the delegated listener and only fires when the event's `cancelBubble` flag is still false after the row dispatch runs, matching the DOM bubbling semantics the JSX nesting visually suggests.
