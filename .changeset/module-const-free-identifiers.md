---
"@barefootjs/jsx": patch
---

Client JS: a module const's dependencies now come from the free identifiers of its initializer's AST instead of a token scan of its value text. An object key, a member name or a callback parameter inside a module const no longer keeps an unrelated declaration of the same name in the client module (for example a server-only `const label = process.env.X` that threw `ReferenceError` at hydrate). `extractFreeIdentifiersFromNode` also treats `function` expression, method and accessor parameters as bound, and no longer reports a method name or a destructuring key as a read (#3801).
