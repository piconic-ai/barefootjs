---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

A memo, a signal seed or a child prop that reads a component-scope array literal with a spread element (`const local = [...b, 'z']; createMemo(() => local.length)`, `createSignal([...b].length)`, `<Kid n={local.length} />` on Go) is now refused with BF101 on every template adapter, instead of rendering empty (or `0` on Go) where JS renders the computed array. `/* @client */` on the read defers it to the browser.
