---
"@barefootjs/go-template": patch
---

Declare the `signal-optional-init` conformance fixture as a known render divergence (`optional-typed-signal-initial-value-dropped`): a signal declared with a union type such as `createSignal<string | undefined>('one')` is typed `interface{}` and seeded `nil` in the generated Go props, so the server render drops the literal initial value. Declared, not fixed.
