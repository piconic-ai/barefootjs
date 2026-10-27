---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

A `(props)`-arg component's body destructure binding whose default passes a callback (`const { b: local = ['y', ''].filter((x) => x !== '') } = props`), read through a memo or a signal seed, now takes its default when the prop is omitted (#3690). The client `template:` reads the memo body and signal seed with the same live prop read markup uses (`_p.b ?? (<default>)`), where it used to render empty. go-template applies the default to a memo it computes with the runtime evaluator (`createMemo(() => local.length)`), where it used to compute over the omitted prop.
