---
"@barefootjs/go-template": patch
---

Fix numeric/boolean JSX-expression literal props on a child component (`count={5}`, `active={true}`) rendering as Go zero values (`0`/`false`) instead of the actual literal.

`emitStaticChildInstances` builds each nested child component instance's `<Child>Input{...}` Go struct literal from the parent's JSX attributes. A plain quoted string attribute (`label="mail"`) is a distinct `AttrValue` kind (`literal`) handled separately and unaffected. `count={5}`/`active={true}` are curly-brace attributes — always `kind: 'expression'` regardless of what's inside the braces — so they fell to `resolveDynamicPropValue`, which only recognized a signal/memo getter call or a comparison against one. A bare `5`/`true` matches neither, so the field was silently OMITTED from the struct literal entirely, defaulting to Go's zero value.

The `expression`-kind branch now checks the attribute's structured `parsed` tree (already attached during IR construction) for `kind: 'literal'` before falling to `resolveDynamicPropValue`, and emits the literal's Go representation directly — the reliable structural signal, rather than re-matching the raw source text.

`child-primitive-props` graduates from a render divergence to a passing render.
