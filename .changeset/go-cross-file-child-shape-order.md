---
"@barefootjs/go-template": patch
---

A parent's Go output no longer depends on which file of a build compiles first (#3753). `@barefootjs/vite` compiles every component onto one adapter in file-name order, and the adapter knew a child from another file only when that child's file had already compiled and declared more than one component. So `<CheckIcon data-slot="indicator" />` dropped its `data-slot` whenever the child collected it in a rest bag from a file that sorted after its parent, or that declared only that one component, and a parent wrote a child's Input field through `bf.Coerce` or not depending on the order. The adapter now reads each relatively imported child file from disk and registers its components' shapes before the parent generates (again when the file changes), so the parent builds the same constructor in any order. Aliased imports (`@/components/...`) are not resolved this way yet.
