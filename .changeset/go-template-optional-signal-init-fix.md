---
"@barefootjs/go-template": patch
---

A signal declared with a nullable type argument and a literal initial value (`createSignal<string | undefined>('one')`) now seeds its Props field from the literal at SSR. `convertInitialValue` unwraps a two-member `T | undefined` / `T | null` union to its non-nullish primitive for the literal-baking decision (the field stays `interface{}`-typed), so `title="one"` and the text `one` render on the server as on every other adapter instead of `nil`. The `optional-typed-signal-initial-value-dropped` known-limitation entry and its render-divergence pin are removed; the `signal-optional-init` fixture is the regression test.
