---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

A read of a key of an object const built with a spread of another literal const (`const B = { ...R, extra: 1 }` read as `B.k` and `B.extra`) now renders the value on every template adapter. The spread is expanded in the shared literal-const member lookup, in source order, so a later entry still overrides an earlier one and spreads chain. Before, the read was an unbound template variable: Mojolicious and Go template failed to render, and Xslate, Jinja, ERB, Pebble and Rust rendered it empty. A spread of anything that is not a plain literal const object (a call, a member, a `let`, an array) is still not expanded. Go template's own module-const key lookup also skipped spreads and returned the first entry of a repeated key; it now uses the shared lookup.
