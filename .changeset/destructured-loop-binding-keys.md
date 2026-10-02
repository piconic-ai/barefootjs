---
"@barefootjs/jsx": patch
---

In a `.map()` callback with a destructured parameter (`({ color, label }) => …`), an object-literal key or a member name that matches a binding name is no longer rewritten into an item accessor. `{ color: 1 }` used to compile to invalid JS (`{ __bfItem().color: 1 }`), and `obj.color` became `obj.__bfItem().color`. The destructured-binding rewrite now uses the same AST walk as the plain-parameter rewrite. A shorthand `{ color }` now compiles to `{ color: __bfItem().color }` instead of `{ "color": __bfItem().color }`, which is the same object.
