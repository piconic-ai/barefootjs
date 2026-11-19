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

The text of an HTML `<style>` or `<script>` element is no longer HTML-escaped. The HTML parser decodes no character reference in these elements, so `<style>{'a[href="x"] > b { color: red }'}</style>` used to reach the CSS parser as `a[href=&quot;x&quot;] &gt; b`, on the server render, in the client template and after a reactive update alike. A static or dynamic child now prints as written on every adapter, and only the sequences that would end the element are rewritten, in a form CSS and JavaScript / JSON read back as the same text: `</style` becomes `<\/style`, and `<script` / `</script` become `<script` / `</script` (ASCII case-insensitive). A value therefore still cannot close the element or open a tag after it. `<textarea>` and `<title>` decode references and keep the HTML escape.

The IR marks such children with `rawText` (decided once in `raw-text-host.ts`), `@barefootjs/shared` exports the encoder as `escapeRawText`, and each backend runtime gains the matching `raw_text` helper, so a compiled template needs the runtime released with it. go-template prints literal text this way and still refuses a dynamic child of these elements (BF101).

Reading the component's `children` in a `<style>` / `<script>` (`<style>{children}</style>`) is now refused with BF101: the children arrive as rendered, HTML-escaped markup, which cannot be turned back into the text they were written as. Pass the text as a prop instead.
