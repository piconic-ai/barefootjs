---
"@barefootjs/go-template": patch
---

Lower an array memo's `.length` to its handler-filled loop slice count (PostList status count, #1897 follow-up — Capability D, completing the derived-state fix).

A memo used both as a loop source (`visible().map(...)`) and as a count (`visible().length`) previously lowered the count to `len .Visible` — a memo field the adapter leaves unset (nil) — so the status line rendered `0`. The loop's `.map()` already becomes a handler-filled slice (`.PostListItems`) holding exactly the rendered (filtered) items, so the adapter now maps each array memo to that slice and lowers `<memo>().length` to `len .<Slice>` (loop-scoped through `$.` when nested). `props.items.length` and other lengths are unaffected.

With this, the shared blog `PostList` renders fully on Go template SSR: `params` / derived classes / hrefs / counts all resolve, no execute-time crashes.
