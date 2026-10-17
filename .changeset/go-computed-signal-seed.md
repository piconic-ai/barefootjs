---
"@barefootjs/go-template": patch
---

A signal seeded by a computed expression over a prop (`createSignal(props.label || 'none')`, `createSignal(props.flag && 'on')`, `createSignal(props.n * 2)`) now starts at the expression's value: it is seeded by the runtime evaluator, as a memo body is. Before, `||` seeded the bare prop and dropped its fallback, and other shapes seeded `nil`.
