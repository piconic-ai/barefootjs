---
"@barefootjs/cli": patch
---

Register `TemplateFuncMap` in scaffolded `bf_render.go` so `bf_tmpl` calls work out of the box. The scaffold only called `bf.FuncMap()` but not `bf.TemplateFuncMap(root)`, causing `function "bf_tmpl" not defined` on first render.
