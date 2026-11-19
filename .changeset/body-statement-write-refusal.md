---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
---

A binding that a top-level statement in the component body writes after its declaration (`local.push('z')`, a reassignment in a loop, a property write, a write in a callback the statement runs in place such as `xs.forEach(x => out.push(x))`) is now refused with BF101 where the compiled output read it as it was declared while JS reads the written value. Before, the server render showed the value from before the statement (`{local.length}` rendered `1` where JS renders `2`), and a memo, signal seed or constant declared after the statement was computed too early on the client as well. Two reads are refused: a read by the component's own markup (directly, through a function it calls, or through a memo, signal seed or constant declared after the statement), which `/* @client */` defers to the client, and, in a `'use client'` component, a memo, signal seed or constant declared after the statement. Give the binding its final value where it is declared instead. A memo or signal seed declared before the statement, a read of another `props` member than the one written, a value handed to a child component as a prop, a read in an event handler or effect, and a write inside a callback that runs later compile as before. Such an in-place callback write now also keeps the written constant from being inlined by its declared value in client JS.
