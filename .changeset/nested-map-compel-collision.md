---
"@barefootjs/jsx": patch
---

Fix duplicate `__compEl` declaration when a nested `.map()` returns multiple child components (#1664).

An outer `.map()` whose callback returns a wrapping element containing a nested `.map()` that emits more than one child component compiled all of them into a single shared inner `forEach` body. The emitter declared `const __compEl` once per component in that scope, producing a duplicate `const` declaration that threw `SyntaxError: Identifier '__compEl' has already been declared` at hydration. Each binding is now uniquely suffixed (`__compEl0`, `__compEl1`, …) when multiple components share the inner-loop scope; the single-component case keeps the plain `__compEl` name.
