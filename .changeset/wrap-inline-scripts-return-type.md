---
"@barefootjs/hono": patch
---

`wrapWithInlineScripts` now declares its return type as `JSX.Element`
instead of leaking `unknown`. Every compiled template returns this call
as its component body, so the `unknown` return made every island fail
TS2786 ("cannot be used as a JSX component") in any consumer app that
type-checks its compiled templates. Type-only — no emitted-JS change.
