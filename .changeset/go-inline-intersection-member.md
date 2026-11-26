---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

On go-template, a props member whose type is an inline intersection (`props: { data: A & B }`) now gets a generated struct with the merged members of every constituent, so its member reads (`props.data.label`, `props.data.at.getUTCFullYear()`) render the values instead of an empty string. Before, the member was an `interface{}` field holding the source-keyed map, which a capitalised member read could not find. The member may sit on an inline props type, a props interface, a destructured parameter, a named object type or an array element, and may be optional. An intersection whose members are not all known in the file (a constituent declared elsewhere, or not a reference or object literal) or whose members cannot be reconciled keeps the `interface{}` field. A destructured member typed as an intersection of same-file object types now carries that intersection as its `ParamInfo.type`, as the `props`-object form does, instead of `unknown` with the intersection in `declaredType`. The new `inlineIntersectionMembers` export returns the merged members.
