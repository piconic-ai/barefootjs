---
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
---

The `bf-p` hydration-props attribute no longer includes the component's internal scope id (Go: the `ScopeID` struct field, previously serialised as `scopeID`; ERB/Jinja: a `scope_id` dict key). It has no client runtime consumer — the shared client runtime's only `bf-p` parser reads scope identity from the `bf-s`/`bf-h`/`bf-m` attributes, never from the JSON payload — so this was dead weight on every hydrated request and a payload shape that diverged from the reference Hono adapter. User-declared props in `bf-p` are unaffected.
