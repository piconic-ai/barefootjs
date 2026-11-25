---
"@barefootjs/shared": patch
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
"@barefootjs/pebble": patch
---

A literal attribute before a spread whose bag carries the same attribute under another JSX key now renders once, with the spread's value, as JS spread order requires. On Hono and Pebble this covers a key that spells the attribute in another letter case (`<p tabIndex="1" {...rest}>` with `rest.tabIndex`), which a browser takes for the same attribute; on Hono it also covers a key the spread renames (`htmlFor` beside `for`, `crossOrigin` beside `crossorigin`), which rendered twice before. A literal that spells a closed rest's key in another letter case (`tabindex="1"` beside a rest declaring `tabIndex`) is now merged with it on every adapter, before or after the spread.
