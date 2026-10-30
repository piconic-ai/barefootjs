---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

A component that takes its props as one object under a name other than `props` (`function C(p: { label: string })`, also `scopeID` or `bfParent`) now reads `p.label` as its prop on the template adapters. Blade, Jinja, MiniJinja, Pebble, Twig and Xslate rendered the read empty, ERB raised `undefined method '[]' for nil` and Mojolicious failed with `Global symbol "$p"`. A `.some(r => r.id === p.skip)` / `.filter` / `.sort` / `.reduce` / `.map` callback the runtime evaluator runs now binds `p.skip` instead of an undefined `p`, on these adapters and on go-template.

`BindingScope.forComponent(propsObjectName)` makes the component's props parameter name the props object identifier (`BindingScope.propsObject`); `isRootPropsObject`, `evalBody`, `lowerCallbackMethod`, `lowerSortComparator` and `sortEvalPlan` take that identifier. `propsObjectIdentifier` and `PROPS_OBJECT_IDENTIFIER` are exported.
