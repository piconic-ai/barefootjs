---
"@barefootjs/shared": patch
"@barefootjs/jsx": patch
"@barefootjs/client": patch
"@barefootjs/hono": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/perl": patch
"@barefootjs/php": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

The text of an HTML `<style>` or `<script>` element is no longer HTML-escaped. The HTML parser decodes no character reference in these elements, so `<style>{'a[href="x"] > b { color: red }'}</style>` used to reach the CSS parser as `a[href=&quot;x&quot;] &gt; b`, on the server render, in the client template and after a reactive update alike. A static or dynamic child now prints as written on every adapter. Each `<` that could begin markup (one followed by an ASCII letter, `/`, `!` or `?`) and each `&` that could begin a character reference (one followed by an ASCII letter or `#`) is rewritten to an escape CSS and JavaScript / JSON read back as the same character: `\3c ` / `\26 ` in a `<style>`, `\u003c` / `\u0026` in a `<script>`. The rewrite is applied to the element's whole text in one call, after its text and expression children are joined, so a value cannot close the element or open a tag after it, whether the sequence sits in one child, is spelled across children (`<style>{'<'}{value}</style>`), or the element ends up in SVG / MathML content, where its text is parsed as markup and character references are decoded. `<textarea>` and `<title>` decode references and keep the HTML escape.

A `<` or `&` used as an operator directly before a letter outside a string (`i<n`, `a&&b`) is rewritten too; write it with a space (`i < n`, `a && b`). Code that must be emitted byte for byte goes through `dangerouslySetInnerHTML`. A data block that holds markup (`<script type="text/template">`) cannot be written through a child; use `dangerouslySetInnerHTML`.

The IR lists that text as `IRElement.rawTextContent` (decided once in `raw-text-host.ts`), `@barefootjs/shared` exports the encoder as `escapeRawText`, and each backend runtime gains the matching `raw_text(tag, parts)` helper, so a compiled template needs the runtime released with it. go-template prints literal text this way and still refuses a dynamic child of these elements (BF101).

Reading the component's `children` in a `<style>` / `<script>` (`<style>{children}</style>`) is now refused with BF101: the children arrive as rendered, HTML-escaped markup, which cannot be turned back into the text they were written as. Pass the text as a prop instead.
