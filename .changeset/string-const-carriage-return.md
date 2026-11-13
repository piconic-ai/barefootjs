---
"@barefootjs/twig": patch
"@barefootjs/jinja": patch
"@barefootjs/erb": patch
---

Keep a carriage return in a string constant or literal as Hono renders it. Twig and Jinja rewrite every `\r\n` and lone `\r` in template source to `\n`, so a value such as `'a\rb'` rendered with an LF in attribute, text, comparison and loop positions, and a const compared with a prop holding the same text came out unequal. Twig now writes such a value as a double-quoted literal with the CR spelled `\r`, Jinja spells it `\r` in its single-quoted literal, and both print a CR in static text through an output tag. ERB writes a value holding a CR double-quoted with `\r`, because Ruby reads a CRLF inside a string literal as LF.
