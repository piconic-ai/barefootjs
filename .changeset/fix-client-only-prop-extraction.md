---
"@barefootjs/jsx": patch
---

Fix a `ReferenceError` at hydrate when a destructured prop's only use in a component is inside a `/* @client */`-marked expression. The prop is now correctly extracted from `_p` before the client-side `createEffect` reads it.
