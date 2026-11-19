---
"@barefootjs/jsx": patch
---

A read of a key of an object const built with a spread the compiler cannot expand (`const B = { ...mk() }`, `{ ...R.sub }` over a non-literal member, a spread of a `let` or of an array, in module or component scope) now fails with BF101, escapable with `/* @client */`, on every template adapter. A read with a key only known at run time (`B[props.key]`, `B?.[k]`, `B[i]`, `B[sig()]`) is refused the same way. Before, the read was an unbound template variable with no diagnostic: it rendered empty or failed the render. A key listed after the last such spread (`{ ...mk(), k: 'v' }` read as `B.k`) still renders that entry, since the last entry of a key wins in JS, and a spread of a literal object member of a literal const (`{ ...R.sub }`, `{ ...R['sub'] }`) now expands like a spread of the const itself.
