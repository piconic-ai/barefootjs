---
"@barefootjs/go-template": patch
---

A dynamic value on a `data-on…` attribute (`<div data-on={mode()}>`) now renders as plain attribute text on the Go adapter, as Hono renders it. `html/template` strips a leading `data-` before classifying an attribute, so it escaped `data-on…` as an event-handler attribute and rendered the value as a quoted JS string (`data-on="&#34;x&#34;"`). Such names are now emitted through a new `bf_attr_name` runtime helper (`template.HTMLAttr`), which `html/template` does not classify, so the value keeps its ordinary form and plain HTML escaping.
