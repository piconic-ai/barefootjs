---
"@barefootjs/go-template": patch
---

A signal seeded by a `??` whose fallback reads another prop (`createSignal(props.b ?? props.a)`, `createSignal(props.c ?? props.b ?? 'z')`) now falls through to that prop when the first one is omitted or `null`: the seed is evaluated by the runtime evaluator. Before, it seeded the first prop alone. A hoisted `props.X ?? <literal>` fallback local now seeds only a signal whose own fallback is that literal; a sibling seed with another fallback, such as a renamed body-destructure default (`const { b: local = 'x' } = props`), is evaluated with its own, and a bare `createSignal(props.b)` read through a memo is the prop itself. The prop's own field keeps the caller's value unless a signal shares it, so a template read such as `props.b ?? 'd'` or a bare `props.b` no longer sees a signal's fallback.
