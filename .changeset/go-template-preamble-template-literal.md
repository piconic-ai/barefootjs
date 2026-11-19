---
"@barefootjs/go-template": patch
---

A `.map()` callback preamble local built from a template literal (`const label = `[${row.name}]``) no longer makes the generated Go template fail to parse at render time (`unexpected "[" in command`). The initializer now lowers to one `bf_concat_str` pipeline value, so the row renders as Hono does.
