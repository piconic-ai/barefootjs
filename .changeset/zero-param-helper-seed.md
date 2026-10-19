---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

A signal seeded through a zero-param local helper call (`const isWide = () => props.mode === 'wide'; createSignal(isWide() ? props.label : 'narrow')`) now starts at its value on every adapter and in the CSR template. Before, the template adapters and CSR rendered it empty. Only a synchronous helper whose body is a pure value expression is read through; an async or generator helper, or one whose body mutates state, keeps its call.
