---
"@barefootjs/router": minor
---

Add `searchParams()` — a reactive read of the URL query, exported from `@barefootjs/router/signals`. An island reads it in a memo/effect and updates fine-grained when the query changes, with no outlet swap and no re-hydration — turning a URL-bearing, data-only change (sort/filter/paginate/search) into a plain reactive update. When the signals module is loaded, a same-route query-only navigation (link click or back/forward) updates the signal + URL without swapping; a pathname change still swaps. The accessor is branded `Reactive<…>` so the existing compiler reactivity analysis wires the DOM updates (no new compiler feature); it's a pure-runtime primitive where server and client read the same source (request URL ↔ location). Opt-in by importing it (legacy query swaps otherwise). Requires `@barefootjs/client`.
