---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Accept a caller-resolved script URL list via `AdapterGenerateOptions.scriptAssets`

Adapters computed their client-JS `<script>` URLs at codegen time from two
adapter-construction options — `barefootJsPath` for the shared runtime and
`clientJsBasePath + name + '.client.js'` for the component itself. That
computation bakes in three assumptions a bundler-driven pipeline breaks: that
the URLs are knowable before bundling (they are content-hashed after), that
there are exactly two of them (a dev-server client script makes three, a
server-only component zero), and that the runtime is a separately-registered
script (as an ESM import of a shared chunk it is not registered at all).

`scriptAssets` is an ordered list of fully-resolved absolute URLs, supplied
per-generate, that each adapter emits as one module-script registration per
entry in its own native form — `{{.Scripts.Register "…"}}` for Go templates,
`<%- bf.register_script('…') -%>` for ERB, `@php($bf->register_script('…'))`
for Blade, and so on. The caller owns all resolution.

Precedence: `skipScriptRegistration` still wins unconditionally; then
`scriptAssets` when present; then today's computed paths. `undefined` means
"fall back to the legacy computation" and is distinct from `[]`, which means
"this component needs no scripts at all".

Purely additive — with `scriptAssets` unset every existing caller keeps
byte-identical output, which the unchanged conformance-fixture corpus
confirms.
