---
"@barefootjs/jsx": patch
---

Fix inline object-literal attribute / prop / provider values parsing to
`unsupported` instead of `object-literal`. `attachParsedExpressions` parsed a
bare `{ … }` value directly, but an unparenthesized object literal is a block
statement, so `opts={{ align: 'start' }}` / `style={{ … }}` landed as
`unsupported`. After the adapters switched to reading the IR-carried tree
(#2018), the Mojolicious / Xslate inline-object lowerings then refused these
with BF101 (regressing the carousel SSR conformance). Parenthesize a
`{`-leading value before parsing so it becomes the `object-literal` the
adapters' `objectLiteralExprToPerlHashref` / `objectLiteralToGoMap` lowerings
expect; every other expression is unaffected (redundant parens are stripped on
parse). Restores byte-identical carousel render across Go / Mojo / Xslate.
