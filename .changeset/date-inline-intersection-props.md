---
"@barefootjs/jsx": patch
---

A `Date` prop declared on a constituent of an inline intersection props type (`props: Base & { label: string }`) is now seen by the date lowering, the same way the alias form (`type Props = Base & { ... }`) already is. Before, the inline form lowered to `unknown`, so `props.at.getUTCFullYear()` rendered an empty string without any diagnostic on the mojolicious, xslate, jinja, erb, pebble and rust adapters, and failed at render time on go-template. Parenthesized and nested constituents, object literal constituents, constituents that extend a base interface and destructured parameters all resolve; a constituent declared outside the file, or irreconcilable declarations of the receiver prop, are refused with BF021 as for the alias form. `TypeInfo` gains optional `inherits` / `inheritance` fields, set only on the props type of such a component.
