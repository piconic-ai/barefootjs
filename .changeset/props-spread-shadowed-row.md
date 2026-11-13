---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

`{...props}` inside a loop row, callback parameter, destructured field or local named like the component's props object now spreads that binding on the DSL template adapters (Blade, ERB, Jinja, Rust, Mojolicious, Pebble, Twig, Xslate) and in the Go template adapter's child-call planning (#3727). `rows.map((props) => <span {...props} />)` spread the component's own props on every row, where Hono spreads the row. The compiler now marks such a spread (`SpreadAttr.shadowsPropsObject`) and every adapter asks one shared `spreadsPropsObject` helper, instead of each comparing the spread's text with the props object's name. Go still refuses a spread of a row onto a child component with BF101.
