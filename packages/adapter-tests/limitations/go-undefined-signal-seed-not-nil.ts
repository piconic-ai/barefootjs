import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A nullable-typed signal seeded with a literal `undefined` bakes to the empty string, not nil',
  given:
    'a component-local signal declared with a nullish union type and a literal `undefined` initial value (`createSignal<string | undefined>(undefined)`), forwarded to a child prop that the child reaches only via a closed-type `{...rest}` spread',
  expected:
    'the SSR constructor seeds the value as absent (Go `nil`), so the child omits the forwarded attribute entirely, matching the Hono reference',
  actual:
    "seeds the signal's own `interface{}`-typed field with the empty string (`\"\"`) instead of `nil` — `convertInitialValue`'s string-primitive fallback (`value-lowering.ts`) always returns `\"\"` for a value it can't recognise as a quoted literal, with no explicit check for the literal text `undefined`/`null` — so the child's rest bag receives `{\"tag\": \"\"}` instead of an absent key, and renders `tag=\"\"`",
  fixtures: ['child-prop-rest-forward-undefined-start'],
})
