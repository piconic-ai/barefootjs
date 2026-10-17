---
'@barefootjs/jsx': patch
---

A component-scope const that shadows a prop of the same name with a default (`const label = props.label ?? 'Default'`) now renders its default on a client-side (CSR) mount. The CSR template read the name as the prop (`_p.label`), so the default never applied there while SSR rendered it. A body destructure with a default (`const { label = 'Default' } = props`) still reads the prop, which carries that default. `ui/toast`'s `variant` (`props.variant ?? 'default'`) is one such const.

Such a const is now an ordinary component-scope local in the CSR template, exactly like the same const under a different name (`const text = props.label ?? 'Default'`). So the limits that already applied to that form now apply to it too: a const built from it with a method call (`const upper = label.toUpperCase()`) and read in the template reports BF061 (#3513). Before, it read `_p.label` without the default and without a diagnostic.

A `let` reassigned right after its declaration (`let label = props.label ?? 'Default'; if (!label) label = 'Fallback'`) now renders its render-time value on every template adapter and on CSR. Its side-effect-free reassignments (`x = e`, compound assignments, `if`/`else` and blocks of them) are folded into the initializer before analysis, so every stage reads one value. Before, the template adapters read the bare prop and rendered empty text when it was omitted. A reassignment that cannot be folded (in a loop, after a call, or with a side effect) keeps reading the prop.
