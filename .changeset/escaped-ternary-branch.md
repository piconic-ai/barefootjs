---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

A string-literal ternary branch with an escape sequence in an attribute (`data-a={on ? 'a\nb' : 'c'}`, `` class={`k ${on ? "it's" : 'x'}`} ``) is now re-emitted as a valid string literal. The compiler printed the branch's decoded value between bare single quotes, so a `\n` became a raw newline (an unterminated string in the Hono TSX and the client JS) and a `'` or `\\` broke or changed the literal. Mojolicious and Xslate had the same unescaped spelling, and Go Template wrote the branch into the attribute without HTML escaping, so a `"` ended the attribute. Branches without such characters print as before.
