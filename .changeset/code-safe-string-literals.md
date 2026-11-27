---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Every JS string literal the compiler writes into the client JS, and into the Hono adapter's marked template, is now spelled by one helper, `codeSafeStringLiteral`. It writes `<`, U+2028 and U+2029 as `\uXXXX` escapes, so a literal prop value, a quoted prop name, an attribute or key literal, a lookup table entry, a ternary branch, a controlled `<select>`'s option comparison, a loop row's quoted destructure key, a literal loop `key` or a closed rest key's literal fallback that holds `</script>` or a line separator no longer carries it raw into the emitted code. The literal still evaluates to the same string, and a literal without those characters prints exactly as before. `>` and `/` are not escaped: with `<` escaped no end tag or comment can begin, and paths, URLs and utility classes such as `[&>*]:w-full` keep their spelling (UnoCSS reads class names from the compiled output). `codeSafeStringLiteral` no longer escapes `>` or `/` itself, and `codeSafeStringArray` is exported beside it.
