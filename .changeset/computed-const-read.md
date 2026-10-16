---
'@barefootjs/jsx': patch
'@barefootjs/blade': patch
'@barefootjs/erb': patch
'@barefootjs/go-template': patch
'@barefootjs/jinja': patch
'@barefootjs/mojolicious': patch
'@barefootjs/pebble': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/xslate': patch
---

A component-scope const computed from props or signals (`const cls = 'btn ' + props.variant`, `const label = props.label ?? 'Default'`) now reads as its initializer wherever a template uses it: text, attributes, conditions, loop rows and memo bodies (Go). Every template adapter used to read it as a template variable nothing defines, so it rendered empty, rendered a same-named prop without the const's default, or failed the Go render. A const whose initializer has no template lowering (`Object.keys(labels)`) now refuses with BF101 instead of rendering an empty value. `ui/xyflow`'s `Flow` reads such a const (`createFlowStore(props)`) as its Provider value and now refuses on the template adapters (see #3502, #3503).
