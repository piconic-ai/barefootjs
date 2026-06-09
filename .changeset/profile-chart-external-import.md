---
"@barefootjs/cli": patch
---

fix(profile): detect external `@barefootjs/*` runtime imports before the run (#1849 B3 follow-up)

`bf debug profile chart --scenario auto` leaked a raw `Cannot find module
'@barefootjs/client/runtime'` stack: the cached `@barefootjs/chart` /
`@barefootjs/xyflow` dists import the client runtime directly, which the
import-rewriting pass can't reach inside an external bundle.

Detection now happens *pre-flight* against the driver's own compiled client JS
(`externalRuntimeImport`): any `@barefootjs/*` import the compiler leaves in the
emitted client JS other than the handled `@barefootjs/client[/...]` /
`@barefootjs/jsx[/...]` families is an un-rewritable external runtime package, so
the run is skipped with an actionable message that names the offending package
and points at `--scenario <story.tsx>` or the static budget. This replaces the
previous error-message classifier, which matched bun's resolution stack text and
was fragile to bun version and importer-path formatting.
