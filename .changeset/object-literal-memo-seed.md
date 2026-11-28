---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

A memo whose body is an object literal (`createMemo(() => ({ k: o.k }))`) now renders its members on Go, where the constructor left the memo `nil` and a read of a member (`m().k`) failed the render with `nil pointer evaluating interface {}.K`. The constructor evaluates the object from what it reads (a literal, a module or component const member, a prop, another memo, a spread of a literal const), and a member read goes through `bf_get`. A body Go cannot compute (a computed key, `{ ['k']: v }`) is refused with BF101 where the template reads it. A signal seeded from an object literal that reads a const member (`createSignal({ k: o.k })`) and an object-literal child prop the child types as a struct (`<Kid v={{ k: o.k }} />`) render the member on Go too, where they rendered empty or `0`.

The static SSR seed evaluator computes an object literal with a spread of a plain object, a computed key and a shorthand property, so the template adapters that read it render a memo such as `() => ({ ...o, j: 2 })` instead of empty members. The evaluator serialization reads a computed member keyed by an array index (`A[1]`, `A['1']`) as an index read, which the backend evaluators run (they read nothing for an array's named property). `MemoInfo.bodyIsObjectLiteral` records an object-literal memo body.
