---
'@barefootjs/jsx': patch
'@barefootjs/blade': patch
'@barefootjs/erb': patch
'@barefootjs/jinja': patch
'@barefootjs/mojolicious': patch
'@barefootjs/pebble': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/xslate': patch
---

The ERB and Mojolicious adapters now forward `{...props}` onto a child component (`<Child {...props} tone="x" />`). Before, they dropped the spread, because their templates hold no `props` value. On every DSL adapter, a prop that both the spread and an explicit prop set is now passed once.

The DSL adapters assemble a child component's props through one shared plan in `@barefootjs/jsx` (`planComponentProps`).
