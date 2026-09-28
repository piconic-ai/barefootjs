---
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
"@barefootjs/pebble": patch
"@barefootjs/go-template": patch
---

Fix a closed-type `{...rest}`-forwarded attribute that starts absent (the caller never passed that key) rendering as `attr=""` instead of being omitted, on every template-string adapter (ERB, Jinja, minijinja, Mojolicious, Twig, Blade, Xslate, Pebble, Go template). Each adapter's "bare optional prop" nullish-omission guard only recognized a `props.<key>`-shaped expression, not the `rest.<key>`-shaped expression `{...rest}`'s per-key expansion produces (#3057), so the guard never fired for a rest-forwarded key and it always rendered unconditionally.

The Go template adapter's own reactive-omission guard used the same fix, plus a Go-specific `bf_get`-vs-nil check for the rest bag (a `map[string]any` field, not a Props-struct field like other optional props). A separate, unrelated gap remains on Go: a signal declared `T | undefined` and seeded with a literal `undefined` still bakes to the empty string instead of `nil` when forwarded this way — tracked as the `go-undefined-signal-seed-not-nil` known limitation, with the affected fixture pinned there rather than fixed here.
