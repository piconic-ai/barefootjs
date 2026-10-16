---
'@barefootjs/jsx': patch
'@barefootjs/blade': patch
'@barefootjs/erb': patch
'@barefootjs/go-template': patch
'@barefootjs/jinja': patch
'@barefootjs/mojolicious': patch
'@barefootjs/pebble': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/xslate': patch
---

A method call with arguments that no template lowers, outside a higher-order callback (`s().localeCompare('m')`), now refuses with BF101 (`/* @client */` or a precomputed prop) on every template adapter. It used to render a read of the method name, dropping the call and its arguments; on Go it emitted a method call on a plain field.
