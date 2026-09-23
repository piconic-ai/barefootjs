---
"@barefootjs/jsx": patch
---

A child component rendered directly inside a reactive conditional branch that was active when the page hydrated (or client-mounted) was initialized twice: once by the branch's own `insert()` bindEvents and once by the component's trailing static child-init pass, against a node the branch had already re-rendered away. Its `onMount` listeners and effects ran in two instances, and removing the branch disposed only one of them. `collectElements` now leaves every child a conditional branch initializes to that branch (`collectConditionalBranchComponentNodes` is the single definition of which children a branch owns), and the `@bf-child` import markers for those children are collected from the branch itself. The `conditional-child-listener-cleanup` fixture and the `child-listener-cleanup` / `child-effect-disposal` exploration scenarios are the regression tests.
