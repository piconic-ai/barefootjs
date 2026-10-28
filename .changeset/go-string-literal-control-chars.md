---
"@barefootjs/go-template": patch
---

Escape line breaks, tabs and other control characters when a string value is spelled as a Go string literal. A module const holding a newline (a multiline template literal or a `'\n'` escape) no longer leaves a raw newline inside a `{{"..."}}` action or a generated Go constructor, which made the template panic with `unterminated quoted string` or the Go build fail.
