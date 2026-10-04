---
"@barefootjs/jsx": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Static text whose first non-blank character is the engine's line-statement sigil now renders verbatim on the Mojolicious (`%`) and Xslate (`:`) adapters. Text right after a conditional (`{c ? 'on' : 'off'} :y`) lands on its own template line after the closing `% }` / `: }`, and the engine read that line as code: a parse error, or the text silently vanished when the line happened to parse. A line-leading sigil in static text is now emitted through an output expression for the character itself (`<%= '%' %>`, `<: ':' :>`) by the new shared helper `escapeLineStatementSigil` in `@barefootjs/jsx`.
