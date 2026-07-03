---
"@barefootjs/erb": minor
---

Add `@barefootjs/erb` — an ERB (Embedded Ruby) adapter that compiles BarefootJS IR to `.erb` templates and ships a stdlib-only Ruby rendering runtime (Ruby 3.3). Because the rendering backend is framework-agnostic, it runs under any Rack app (Sinatra, Rails, plain Rack) — no framework-specific plugin required. The full conformance corpus is green (compiler unit tests, adapter conformance fixtures, CSR conformance, and a live-render Ruby minitest suite), and a Sinatra integration example demonstrates end-to-end usage.
