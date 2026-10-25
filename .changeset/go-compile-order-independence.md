---
"@barefootjs/go-template": patch
---

Test-only: the conformance harness now refuses to compile a fixture whose `@barefootjs/client` import does not resolve (an unbuilt `dist`), instead of compiling it with every reactive primitive typed `any`. That silent fallback made go-template output for the same fixture change between runs (`map-key-index` printed `{{bf_text .}}` instead of `{{.}}`, and `loop-row-scalar-member-length` failed with `can't evaluate field Length in type interface {}`), which looked like a dependence on compile order (#3637). A new go-template test pins that output does not depend on compile order. Generated templates and Go are unchanged for every fixture and component.
