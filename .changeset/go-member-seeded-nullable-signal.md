---
'@barefootjs/go-template': patch
---

An attribute bound to a nullable signal seeded from an optional member of an object prop is now omitted when the caller leaves the member out, as Hono does (#3323). An example is `createSignal<string | undefined>(initial.label)` with `initial` = `{}`. The member's generated struct field becomes `interface{}`, with `omitempty`, so the absent value stays `nil` instead of reading as `""` / `0`. This applies to both named and inline object types, and every component in a file that shares the type emits it the same way.
