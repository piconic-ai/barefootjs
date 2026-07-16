---
"@barefootjs/go-template": patch
"@barefootjs/rust": patch
---

Pin `object-catalogued` (#2277) as a render divergence on the two typed
struct backends. An inline object-typed prop's nested member access
(`props.cfg.id`) renders empty on Go and Rust because the inline object type
doesn't synthesize a named struct/typed field — tracked as #2299. The
object-synthesis data points still run the oracle comparison on Hono and
every dynamic backend (Ruby/Python/PHP/Perl).
