---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

go-template now refuses, with BF101, a reactive expression (or an element, conditional, loop or component) as the child of a `<title>` / `<textarea>` in SVG or MathML content (`<svg><title>{props.tip}</title></svg>`). Before, it compiled without a diagnostic and rendered the `<!--bf:sN-->` slot markers as HTML-escaped visible text, because Go `html/template` reads `title` / `textarea` as RCDATA whatever the namespace and escapes every `<` there, so hydration could not find the slot. Literal text, a constant expression, and a `<title>` that is an HTML-namespace host (under `<foreignObject>`, `<desc>`, or an `<annotation-xml encoding="text/html">`) still render. The IR marks such foreign-content elements with `foreignRawTextTag`, decided once in `raw-text-host.ts`; the other adapters, which keep the comment-node markers, are unchanged.
