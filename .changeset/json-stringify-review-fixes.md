---
"@barefootjs/perl": patch
"@barefootjs/go-template": patch
---

`JSON.stringify` keeps a string prop quoted on Mojolicious and Xslate after the template compared it with a number (`'1e5' < 0` no longer makes `JSON.stringify('1e5')` render `100000`). On go-template a self-referencing map or slice passed to `JSON.stringify` aborts the render with a cycle error again, instead of overflowing the stack.
