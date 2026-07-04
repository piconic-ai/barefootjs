---
"@barefootjs/jsx": minor
---

`.sort(byPrice)` / `.toSorted(byPrice)` now resolve a bare-identifier comparator one hop through same-file scope (module- or component-scope `const byPrice = (a, b) => …` or `function byPrice(a, b) {…}`) and feed the resolved arrow through the unchanged comparator catalogue, so a function reference compiles exactly like the inlined comparator on every adapter (#2090). Unresolvable references (imports, props, alias chains) and resolved-but-off-catalogue bodies keep BF021, with distinct messages naming the comparator.
