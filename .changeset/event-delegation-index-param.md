---
"@barefootjs/jsx": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/rust": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
---

Thread the `.map()` index param through the list-item event-delegation dispatcher. When a delegated handler closed over the callback's index (`items().map((item, i) => <button onClick={() => handle(i)} />)`), `bf build` lowered the per-item handler into a single delegated listener that re-derived the *item* from `data-key`/DOM position but dropped the *index* — so `i` was a dangling reference and the handler threw `ReferenceError: i is not defined` the first time it fired (item-property access like `item.id` worked because that was re-derived). The dispatcher now re-derives the index from the same runtime source the item comes from — `arr.findIndex(...)` for keyed lookups, the already-computed DOM position for the index-based lookups — and binds it under the user's param name. Output is unchanged for handlers that don't reference the index.
