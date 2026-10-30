---
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
---

ERB and Mojolicious: a string literal containing a template tag delimiter (`{'a %> b'}`, `{show ? '<% x' : y}`, `` {`${a} %> b`} ``) renders as written. The literal is spelled inside an ERB / EP tag, and the delimiter ended (or, on Mojolicious, opened) that tag: the render failed with a Ruby `SyntaxError` / a Perl compile error, and ERB read `%%>` as `%>`. Such a literal is now written double-quoted with `%` hex-escaped. Mojolicious also writes template-literal text through the same string-literal spelling, so its static chunks are single-quoted unless they need escapes.
