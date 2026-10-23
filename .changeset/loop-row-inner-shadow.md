---
"@barefootjs/jsx": patch
---

Leave a name an inner binding rebinds alone when the client JS rewrites a loop row's item, index or destructured bindings as accessors. An inner `.map((tag, i) => …)` inside a loop-row child component's forwarded children no longer turns into `(tag, i()) =>` (a SyntaxError), and reads of `i` inside it refer to the inner index. The same holds for a nested `const`, function declaration or class expression of the same name.
