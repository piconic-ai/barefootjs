---
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Add `override` modifier to `renderAsync` in the Go-template, Mojolicious
and Xslate adapters. Required by Deno's stricter `noImplicitOverride`
default — without it `deno publish` (and `deno check`) fail with TS4114
since `renderAsync` is provided as a concrete fallback on `BaseAdapter`,
not declared abstract. No runtime change — `override` is a type-only
annotation.
