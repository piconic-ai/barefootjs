---
"@barefootjs/jsx": patch
---

Fix a `TypeError` at hydrate when a catalogued rich-type method call (e.g. `Date.prototype.toISOString`, or an explicit-locale `toLocaleDateString(...)`) appears inside a `/* @client */` expression or a reactive attribute binding. These sites used to splice the call's source text verbatim into the emitted client JS instead of routing it through the same `date`/`formatDate` runtime helper the static template and non-`@client` reactive text already use, so the receiver — which crosses the `bf-p` hydration boundary as a JSON-de-riched value — threw when the raw method was called on it.
