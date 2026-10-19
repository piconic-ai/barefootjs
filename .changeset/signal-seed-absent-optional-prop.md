---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

An attribute bound to a signal seeded from an absent optional prop (`createSignal(props.label)`, `createSignal(wide ? props.label : 'narrow')`) is now omitted on the template adapters, as Hono omits it, instead of rendering `name=""`. On Go the prop the seed reads takes a nillable `interface{}` field, so the absence reaches the signal; an explicit `''` still renders `name=""`.
