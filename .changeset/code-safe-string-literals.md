---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Every JS string literal the compiler writes into the client JS, and into the Hono adapter's marked template, is now spelled by one helper, `codeSafeStringLiteral`. It writes `<`, `>`, U+2028 and U+2029 as `\uXXXX` escapes, so a literal prop value, a quoted prop name, an attribute or key literal, a lookup table entry or a ternary branch that holds `</script>` or a line separator no longer carries it raw into the emitted code. The literal still evaluates to the same string, and a literal without those characters prints exactly as before. `/` is not escaped: with `<` escaped no `</` can appear, so paths and URLs keep their spelling. `codeSafeStringLiteral` no longer escapes `/` itself, and `codeSafeStringArray` is exported beside it.
