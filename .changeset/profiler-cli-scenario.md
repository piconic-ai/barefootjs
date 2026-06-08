---
"@barefootjs/jsx": minor
"@barefootjs/cli": minor
---

Wire `bf debug profile <component> --scenario auto` — the dynamic run (#1690).

The CLI now mounts a component's instrumented build in happy-dom, fires each
interactive element once, and prints the joined report (hot subscribers + batch
advisor + coverage). `buildProfileReport(input)` becomes a real pure function
(graph + SR4 join + analyses → ranked findings) and `formatProfileReport`
renders it; `@barefootjs/jsx` now also exports the analysis functions and the
dependency-free `testAdapter` for tooling.

Also fixes a real bug found while dogfooding: the **multi-component** compile
path did not thread `options.profile` to `generateClientJs`, so profile-mode
ids were silently dropped for any file exporting more than one component. Now
threaded — single- and multi-component files both emit ids (profile-off output
is unchanged).

happy-dom is a CLI devDependency, imported lazily so the static modes
(`bf debug profile <component>` / `--diff`) carry no DOM cost.
