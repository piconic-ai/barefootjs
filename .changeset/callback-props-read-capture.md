---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Template adapters: a callback body the runtime evaluator runs (`.filter`, `.some`, `.find`, `.reduce`, `.map`, `.toSorted`, ...) that reads `props.X` through the props object now sees the prop's value. The evaluator env bound `props` itself, which no template defines, so a predicate like `props.items.filter((i) => i > props.n)` kept every row on Blade, Jinja, MiniJinja, Twig and Xslate and failed to render on ERB, Mojolicious, Pebble and go-template. go-template also seeds a `.filter()` memo whose receiver is a destructured prop (`items.filter(...)`), which rendered empty.
