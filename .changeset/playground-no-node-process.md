---
'@barefootjs/jsx': patch
---

The compiler no longer reads the Node `process` global on the compile path. The opt-in `BF_ASSERT_NO_JSX_IN_GETJS` gate in `getJS` is now read through `globalThis`, so bundling the compiler into a browser Worker (the site playground) works again instead of failing every compile with `ReferenceError: process is not defined`.
