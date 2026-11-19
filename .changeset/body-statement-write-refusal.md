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

A binding that a top-level statement in the component body writes after its declaration (`local.push('z')`, a reassignment in a loop, a property write) is now refused with BF101 where the compiled output read it as it was declared. Before, the server render showed the value from before the statement (`{local.length}` rendered `1` where JS renders `2`), and a memo, signal seed or constant declared after the statement was computed too early on the client as well. Two reads are refused: a read by the component's own markup (or by a memo, signal seed or constant the markup reads), which `/* @client */` defers to the client, and, in a `'use client'` component, a memo, signal seed or constant declared after the statement. Give the binding its final value where it is declared instead. A value handed to a child component as a prop, a read in an event handler or effect, and a write inside a callback that runs later compile as before.
