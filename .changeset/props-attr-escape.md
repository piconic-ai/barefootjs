---
'@barefootjs/perl': patch
'@barefootjs/jinja': patch
'@barefootjs/erb': patch
'@barefootjs/rust': patch
---

Fix `props_attr` truncating the `bf-p` hydration payload: the encoded props JSON is embedded in a single-quoted attribute, so a raw `'` inside any string value (e.g. a blog paragraph) terminated the attribute early and the client hydrated from broken JSON (island text bound to props rendered empty). The JSON is now attribute-escaped with each runtime's existing HTML escape (`&#34;`/`&#39;`, matching the Go and JS adapters' behavior); the browser entity-decodes the attribute, so the client's `JSON.parse` sees the original text. Same fix applied to the Perl, Python, Ruby, and Rust runtimes, each with a new `props_attr` round-trip test.
