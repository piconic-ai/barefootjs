---
'@barefootjs/jsx': patch
---

A component-scope const that shadows a prop of the same name with a default (`const label = props.label ?? 'Default'`) now renders its default on a client-side (CSR) mount. The CSR template read the name as the prop (`_p.label`), so the default never applied there while SSR rendered it. A body destructure with a default (`const { label = 'Default' } = props`) still reads the prop, which carries that default. `ui/toast`'s `variant` (`props.variant ?? 'default'`) is one such const.
