---
"@barefootjs/cli": patch
---

Scaffold polish: every adapter now ships a `favicon.svg` plus a `<link rel="icon">` (no more 404 on first dev-server load), `bf init` generates a README.md with getting-started commands for the detected package manager and a `bf` CLI cheat-sheet, and the scaffold `build`/`deploy` scripts pass `--minify` to `bf build` so production output matches the documented "~14 kB min+gzip" runtime size.
