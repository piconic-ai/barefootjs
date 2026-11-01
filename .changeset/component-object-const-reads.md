---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

A component-local or module object const, and a body destructure of one, now render what JavaScript reads on every adapter. Before, the compiler gave no diagnostic, and each of these shapes rendered empty, took the wrong branch, or failed at render time:

- A component-body destructure of a const object or of the rest props (`const { tone, size } = conf`, `const { tone } = rest`) binds each name. Before, the destructure was dropped, and Hono SSR threw `ReferenceError: tone is not defined`.
- A member read of an object const (`flags.label`, `flags.a ? 'big' : 'small'`) reads the value the literal gives that key, in text, conditions and attributes.
- A record const indexed by a prop whose type is a union of string literals (`kind: 'ok' | 'err'`, also through a same-file alias or an intersection props type) reads the value of that key in a text child or a condition, and `undefined` for a key the record does not list. An index whose keys are not known at compile time (`kind: string`) could read a key inherited from `Object.prototype`, so the template adapters now refuse it with BF101 (BF102 on Go in a condition) instead of rendering empty.
- A spread of a const holding a static object literal (`<Chip {...base} />`, `<div {...attrs}>`) passes the object's keys. Keys resolve last-write-wins against the element's other attributes and spreads, and against a key repeated in the literal.
- In a `function C(props)` component, `const { label, ...rest } = props` binds `rest` to the remaining props, so `{...rest}` works. Before, Hono SSR threw `ReferenceError: rest is not defined`.
