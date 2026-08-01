---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Declare render divergences for three new correct-output conformance fixtures (#2460, #2464, #2465)

No behavior change — this adds `renderDivergences` entries (published to
`ui/compat.lock.json` and the docs compatibility matrix) for gaps found in the
onboarding TSX-fidelity exploration (PR #2461), all of which live in the shared
compiler layer and affect every adapter including the Hono reference:

- `aliased-destructured-prop` (#2460): an aliased destructured prop
  (`{ n: count }`) loses its rename — template vars, `ssrDefaults`, and the
  props bridge key off the local name (on Go, the caller-side Input struct
  literal fails `go run` outright with `unknown field N`).
- `select-value-ssr` (#2464): controlled `<select>` SSRs an invalid `value`
  attribute instead of `selected` on the matching option.
- `textarea-value-ssr` (#2465): controlled `<textarea>` SSRs a `value`
  attribute instead of element content.

Each entry documents its graduation path: fix the shared emission, regenerate
the fixture's `expectedHtml` from the fixed reference, delete the entry.
