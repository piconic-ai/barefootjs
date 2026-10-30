---
"@barefootjs/go-template": patch
---

A static child's props now build and render on Go templates when the literal does not match the Go type it used to get.

- A quoted attribute that looks like a boolean or a number (`label="true"`, `label="5"`, `title="-0"`) reaches a `string`, optional or rest-object prop as that string. It was spelled as a bare Go `true` / `5`, which failed `go build` for a `string` field and turned `data-x="false"` in a rest object into an absent attribute. A `bool` or `number` prop still takes the bare literal.
- A prop the child neither declares nor collects in a rest object (`<Tag label="a" extra="x" />`) is dropped, as JS ignores it. It was emitted as an `<Child>Input` field that does not exist (`unknown field Extra`), at a plain call site, in a static loop and in a loop row.
- An inline array literal passed to a `string[]`, `number[]` or `boolean[]` prop (`xs={['a', 'b']}`) is baked as that typed slice (`[]string{"a", "b"}`) instead of `[]interface{}`, which Go refused to assign.
