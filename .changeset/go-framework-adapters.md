---
'@barefootjs/cli': minor
---

Add Gin, Chi, and net/http (Go standard library) adapters to `bf init`,
alongside the existing Echo adapter. Each scaffolds a runnable
html/template SSR app with the BarefootJS runtime vendored under
`./bf-runtime` (now including the `bfdev` subpackage for SSE dev
auto-reload).
