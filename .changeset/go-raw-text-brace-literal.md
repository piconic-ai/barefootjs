---
"@barefootjs/go-template": patch
---

Print a `{` that would open a Go action in the literal text of a `<style>` / `<script>` as written (#3967). The brace guard `{{"{"}}` was escaped by html/template for the element's context: `\7b ` / `ZgotmplZ` in a `<style>`, a quoted JS string (or an escape error at render time) in a `<script>`, including in SVG content. Such text now prints through one `bf_raw_text_literal` action typed for the context html/template reads at the start of the element body: `template.CSS` in a `<style>`, `template.JS` in a script it reads as JavaScript (no `type`, or a JavaScript or JSON type such as `module` / `application/ld+json`), and `template.HTML` in a script whose type it reads as other text. A `<script>` whose `type` html/template may read either way (a value a spread can replace, a `/* @client */` value) and whose text needs the guard is refused with BF101 instead.
