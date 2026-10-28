---
"@barefootjs/perl": patch
---

Perl runtime: `json` now writes a negative zero as `0`, matching JS `JSON.stringify(-0)`. Newer Perl / Mojo::JSON combinations spelled the `-0.0` remainder of a negative dividend as `-0.0` (#3698).
