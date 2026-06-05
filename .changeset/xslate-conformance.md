---
"@barefootjs/xslate": minor
---

Add `runAdapterConformanceTests` for the Text::Xslate adapter (mirroring the
Mojolicious suite) plus a `renderXslateComponent` test renderer (`./test-render`
export). Running the shared fixture corpus through real Text::Xslate surfaced
and fixed several codegen bugs, and the standalone `Array.prototype.filter` /
`.every` / `.some` are now lowered (to `grep_filter` / `grep_every` /
`grep_some` Kolon functions registered by `BarefootJS::Backend::Xslate`), so
`todo-app` / `todo-app-ssr` now reach the same `BF103` diagnostic as mojo
instead of refusing `.filter`.

Codegen fixes (previously emitted invalid Kolon): `.join` / `.toLowerCase` /
`.toUpperCase` now use backend functions instead of nonexistent `$bf.*`
methods; string equality emits Kolon `==`/`!=` (not `eq`/`ne`); null literals
emit `nil` (not `undef`); module-scope string constants are inlined.
