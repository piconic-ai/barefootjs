---
"@barefootjs/client": patch
---

Fix #2735: a pure CSR mount (`createComponent()`, no SSR) of a genuine multi-root fragment component (`return <>...</>` with two or more top-level sibling elements) silently dropped every root but the first. `materializeComponent` kept only `parseHTML(html.trim()).firstChild` — the fragment template concatenates all of its top-level children into one HTML string, so every sibling after the first was parsed and immediately discarded, taking with it whatever reactive slots and event handlers lived on those roots. SSR rendered every root; a CSR mount rendered one.

Fixed by collecting every top-level Element the parsed template produced (gated on the same `fragmentRoot` flag #2722 added, since that is the only shape whose template ever emits more than one top-level element) and carrying the extras alongside the primary element through both connect shapes that had no destination-tracking of their own: a `mountAt` replacement now replaces with every root, and the bare (no placeholder, no loop-row position) `DocumentFragment` return now bundles every root between its boundary comments — mirroring `wrapWithScopeComment`'s SSR shape, which already wraps the whole multi-root body in one comment pair. A fragment-root component used as a keyed loop row is left as previously declared (#2733) — no fixture reaches that combination yet.
