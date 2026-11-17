---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

go-template now renders a `.map()` over a module- or function-scope array of literals when the row body mixes the row with the component's own scope. `QS.map(q => <li data-on={q === 'x' ? '1' : '0'} data-label={props.label}>{q}</li>)` was refused with BF101 ("computed value") as soon as the row held a ternary, a `` `${q}-${props.label}` `` attribute, a conditional on the row or a prop read; only a row of plain `{q}` unrolled. The unrolled row now folds the row's values into each expression (`q` becomes `'x'`, `item.on` its value) and lowers what is left through the ordinary path, so props are read as outside a loop. The same fold lets a nested static loop read a signal in its row, so the `signal-read-in-nested-static-loop` and `conditional-nested-const-loop-source` limitations are fixed. A `Record` lookup keyed by the row inside a template attribute is still refused. `@barefootjs/jsx` adds `foldStaticBindings` and a `parsedCondition` on a template attribute's ternary part (#3798).
