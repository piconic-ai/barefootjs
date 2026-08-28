---
"@barefootjs/client": patch
---

Fix #2735: a pure CSR mount (`createComponent()`, no SSR) of a genuine multi-root fragment component (`return <>...</>` with two or more top-level siblings) silently dropped every root but the first. `materializeComponent` kept only `parseHTML(html.trim()).firstChild` — the fragment template concatenates all of its top-level children into one HTML string, so every sibling after the first was parsed and immediately discarded, taking with it whatever reactive slots and event handlers lived on those roots. SSR rendered every root; a CSR mount rendered one.

Fixed by keeping the whole ordered list of top-level nodes the parsed template produced — **not only elements**: bare text between two element roots is itself a root, and a reactive text slot sitting there renders as a `<!--bf:sN-->` marker whose loss leaves the runtime's slot lookup with nothing to bind. The list is gated on the same `fragmentRoot` flag #2722 added, since that is the only shape whose template ever emits more than one top-level node. Both connect shapes that own their destination now insert the whole list: a `mountAt` replacement replaces with every root, and the bare (no placeholder, no loop-row position) `DocumentFragment` return bundles every root between its boundary comments — mirroring `wrapWithScopeComment`'s SSR shape, which already wraps the whole multi-root body in one comment pair.

Also fixes an adjacent crash on the same path: the proxy element threaded through init is now the first **element** among the roots rather than simply the first node, so a fragment whose template starts with text (`<>text<p/></>`) no longer throws `element.hasAttribute is not a function`. A fragment root that renders no element at all is now refused with a warning instead of crashing.

A fragment-root component used as a keyed loop row remains as previously declared (#2733) — no fixture reaches that combination yet — but that path now warns when it drops roots instead of dropping them silently.
