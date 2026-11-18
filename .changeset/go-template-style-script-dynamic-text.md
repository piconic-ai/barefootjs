---
"@barefootjs/go-template": patch
---

Refuse a dynamic value in the text of a `<style>` or `<script>` element with BF101 instead of rendering `ZgotmplZ`. `html/template` escapes these elements as CSS / JS, so the JSX text cannot be reproduced without a `template.CSS` / `template.JS` pass-through, which would make the value an injection point (#3810).
