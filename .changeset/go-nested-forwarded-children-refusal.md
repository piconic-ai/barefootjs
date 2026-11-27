---
"@barefootjs/go-template": patch
---

On go-template, a component that receives JSX children (or a JSX-valued prop) the server renders at template execute time and forwards them into a prop of a nested component, which seeds a signal or a memo from that prop (`<Kid seed={props.children} />` with `createSignal(props.seed ?? 'none')` in `Kid`), is now refused with BF101 at the call that passes the children, instead of silently computing the nested state as if the children were absent (`none` where Hono renders the children). The refusal follows the value through a body const, a destructured binding, a `??` fallback and further components it is forwarded into. Calls whose children reach the constructor (static text or markup, no children, a static JSX prop) compile as before.
