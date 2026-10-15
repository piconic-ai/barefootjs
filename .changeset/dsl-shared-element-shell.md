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

The element markup every template adapter writes the same way (`renderElementShell`, `renderElementAttributes`), the fragment scope wrap (`renderFragmentScope`), the `dangerouslySetInnerHTML` children (`renderDangerousInnerHtml`), the unsupported-attribute BF101 (`unsupportedAttrExpressionError`) and the context-consumer seed (`contextConsumerSeed`) live once in `@barefootjs/jsx`; each adapter supplies only its template spelling. The compiled templates are unchanged.
