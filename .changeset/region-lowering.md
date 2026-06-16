---
"@barefootjs/jsx": minor
"@barefootjs/shared": minor
"@barefootjs/hono": minor
"@barefootjs/go-template": minor
"@barefootjs/mojolicious": minor
"@barefootjs/xslate": minor
---

`<Region>` now lowers to a `bf-region` page-lifecycle boundary (spec/router.md), the smallest end-to-end proof for the router RFC's compiler-derived nested regions. Following the `<Async>` built-in precedent, the compiler recognises `<Region>` (and its self-closing form) by tag name and lowers it to a wrapper `<div>` carrying a deterministic `bf-region="<file scope>:<index>"` id — the `computeFileScope` FNV hash of the source path plus a per-file structural index. Because a layout compiles to one shared partial, every page composing it emits the *same* id, which is what a client router matches a region on across page documents.

The id is a static string, so all four adapters (Hono, Go template, Mojolicious, Xslate) emit byte-identical `bf-region="<id>"` markers — no per-adapter template interpolation. Covered by a cross-adapter conformance fixture (`region-boundary`) in addition to the Hono-only emit assertion in `packages/jsx`.

Recognition is by capitalized tag name; import-scoped disambiguation, a runtime `<Region>` export, nested/sibling runtime diffing, and the scope-ownership dispose/rehydrate path are follow-ups.
