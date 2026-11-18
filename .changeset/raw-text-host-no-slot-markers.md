---
"@barefootjs/jsx": patch
---

A dynamic child of `<style>`, `<script>`, `<textarea>` or `<title>` now renders its bare value, with no `<!--bf:sN-->…<!--/-->` slot markers. Raw text and RCDATA read no comment, so the markers used to become literal text (a style rule dropped, a script statement commented out, a textarea showing the markers) and the client's comment-based update found nothing to update. The element's own content is rewritten on a signal change instead. Shapes that update cannot express (a conditional or element child, a `/* @client */` expression, reactive text inside a loop row or a component's children) are refused with BF021. go-template still refuses dynamic text in `<style>` / `<script>` (BF101).
