---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Go templates render the props a caller passes but a child does not declare when the child reads its whole props object (`<b {...props}>`), as JS does. They were dropped.

- The analyzer records `IRMetadata.propsObjectObservedWhole`: whether a props-object component reads its props as a whole rather than through known keys.
- Such a child gets the same open-ended bag a rest destructure gets, named after its props object (`Props map[string]any` on its Input and Props structs). A caller routes its undeclared props there at a plain, conditional, loop-row or static-loop call site, and the child's `{...props}` spread merges the bag with its declared props.
- A static child loop now also routes a rest-bag prop into the bag instead of emitting a field the child's Input does not have.
