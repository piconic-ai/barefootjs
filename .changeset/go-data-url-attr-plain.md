---
"@barefootjs/go-template": patch
---

A dynamic value on a `data-` attribute that Go's `html/template` classifies as a URL, CSS or srcset attribute (`data-src`, `data-url`, `data-uri`, `data-image-url`, `data-href`, `data-style`, `data-srcset`, …) now renders as plain attribute text, as on Hono, instead of being percent-normalized (`a%20b`) or replaced with `#ZgotmplZ`. These names now go through `bf_attr_name`, the mechanism `data-on…` names already use (#3309). A real `href` / `src` / `style` attribute keeps its contextual escaping, and a `data-*` name the engine already treats as plain (`data-state`, `data-key`) is unchanged.
