---
"@barefootjs/go-template": patch
---

Fix #2743: `<a href={queryHref(base, {…})}>` on the Go adapter no longer diverges from the JS reference (Hono) when `base` contains non-URL-safe or multibyte bytes. `html/template` infers a URL context from the attribute name and percent-encodes the whole value there; the reference only HTML-escapes. A `queryHref`-produced (`query` guard-list) attribute value now emits the whole attribute via a new `bf_attr` runtime helper (`template.HTMLAttr`), the same technique `bf_spread_attrs`/`bfHydrationAttrs` already use to bypass html/template's contextual auto-escaping — keyed on the neutral `helper === 'query'` fact rather than the attribute name, so any URL-context attribute (`src`, `title`, …), not just `href`, gets the same byte parity.
