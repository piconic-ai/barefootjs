---
"@barefootjs/go-template": patch
---

Internal refactor of the Go template adapter: the lowering of `.map()` loops to `{{range}}`, and of the per-row props of a child component nested in a loop row, moves out of `go-template-adapter.ts` into `loop/render-loop.ts`. Generated templates and Go are unchanged for every fixture and component.
