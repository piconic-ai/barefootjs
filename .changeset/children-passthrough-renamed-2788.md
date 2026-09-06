---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Fix #2788: a bare-props-form component (`function Foo(props: Props)`) whose body destructures a prop under a different local name (`const { children: kids } = props`) now reaches SSR correctly on Mojolicious and Go instead of dying/failing template execution. Added `resolveBodyDestructuredPropAliases` (`props-binding.ts`), which recognizes the analyzer's `props.<key>` member-read shape for such a destructure and seeds/routes the local name alongside the caller-facing key.
