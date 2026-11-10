---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

A local function, const or module binding that shares its name with a typed prop of a `(props)`-arg component keeps its lexical meaning on SSR (#3721). Before, every template adapter read `value()` (with `function value() { return 1 }` and `props: { value?: number }`) as the prop, so a supplied `{ value: 9 }` rendered `9` where Hono renders `1`. The SSR seed plan and the static SSR defaults now treat a prop as a bare name only where the component binds it (`templatePropReadParams`, the decision the client template already used). A zero-argument call of a function that takes no parameters and returns one expression (a `function` declaration or an arrow `const`, component or module scope) now renders as that expression in markup, memo bodies and signal seeds. A zero-argument call of any other local function is refused with BF101 instead of rendering an unbound name or the prop.
