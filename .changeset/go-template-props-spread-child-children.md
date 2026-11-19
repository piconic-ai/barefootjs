---
"@barefootjs/go-template": patch
---

A `{...props}` spread onto a child component that also has JSX children no longer emits two `Children` fields in the child's input literal (`duplicate field name Children in struct literal`, so `go build` failed) when the props type declares `children`. The call's JSX children are the last writer of `children`, as in JS and on Hono, so they win over the `children` key the spread carries: the child gets one `Children` field holding the call's own. A spread call without JSX children still forwards the caller's `Children`. The shared props plan now sees the call's children for the loop-row and static child sites too.
