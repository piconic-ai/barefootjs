---
"@barefootjs/jsx": patch
---

Fix #2300: a bare `class={record[key]}` attribute — a local const `Record`
indexed by a prop, written directly as the attribute value rather than inside
a template literal — now renders on every backend. The analyzer lifts it into
the same `lookup` IR part the `${record[key]}` template-literal form already
produces, so it flows through the shared, already-working lookup path instead
of a raw index access that the typed / strict backends (Go, minijinja, ERB,
Jinja) mishandled for a function-local const — it is not a prop field, so
those emitted an unpopulated `.Record` / nil lookup and the class rendered
empty (or, on ERB, raised). `record-index-lookup` (the template-literal form)
already proved every adapter renders the `lookup` part correctly. Covered by
the new `local-record-union-index` conformance fixture.
