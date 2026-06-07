---
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/hono": patch
---

`scripts/jsr-publish.ts`: drop dev-tooling-only export keys (`./build`,
`./test-render`) and `bun:`-only conditions from the generated JSR
manifests.

These entries are Bun-runtime-shaped (test-render uses `Bun.*` /
`import.meta.dir` directly; the per-adapter build helpers are wired
for the `bf` CLI which ships as an npm executable) and never load
cleanly under Deno's type-checker. They were the residual cause of
`deno publish` type-check failures even after #1792 fixed import
extensions — JSR was being asked to publish files it had no business
type-checking against Deno's runtime.

The npm-published surface is unchanged — these exports remain
available to Bun / Node consumers exactly as before.
