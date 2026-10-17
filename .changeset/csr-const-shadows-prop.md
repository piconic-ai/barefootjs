---
'@barefootjs/jsx': patch
---

A component-scope const that shadows a prop of the same name with a default (`const label = props.label ?? 'Default'`) now renders its default on a client-side (CSR) mount. The CSR template read the name as the prop (`_p.label`), so the default never applied there while SSR rendered it. A body destructure with a default (`const { label = 'Default' } = props`) still reads the prop, which carries that default. `ui/toast`'s `variant` (`props.variant ?? 'default'`) is one such const.

Such a const is now an ordinary component-scope local in the CSR template, exactly like the same const under a different name (`const text = props.label ?? 'Default'`). So the limits that already applied to that form now apply to it too: a const built from it with a method call (`const upper = label.toUpperCase()`) and read in the template reports BF061 (#3513). Before, it read `_p.label` without the default and without a diagnostic. A `let` that is reassigned later has no single value to inline, so it still reads the prop, as before.
