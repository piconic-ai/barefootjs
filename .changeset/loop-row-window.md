---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
---

Share a loop row's window across the eight DSL adapters (#3473). `DslTemplateAdapter.renderLoopRow` now enters the row's scope around the preamble locals, the children and the whole-item-conditional key anchor, sets and restores `inLoop` around the children, and computes the row's root-prop aliases. `DslTemplateAdapter.loopPlanFor` calls `planLoop` against the current scope. Each adapter's `renderLoop` passes only its spelling. The generated templates do not change.
