---
"@barefootjs/go-template": patch
---

An expression that reaches the Go emitter with no template lowering now fails the build with BF101 instead of writing `[UNSUPPORTED: …]` text into the template, which `html/template` could only reject at render time.
