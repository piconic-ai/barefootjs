---
"@barefootjs/jsx": patch
"@barefootjs/cli": patch
---

`bf build` no longer mangles string-literal contents when inlining a local module into a client component's chunk. The combine and specifier-normalisation passes are now AST-aware, so `import …` lines and `@barefootjs/client` text that merely appear *inside a string value* (e.g. an inlined data module exporting a code snippet) are left untouched. This fixes a hydration break (`ReferenceError: hydrate is not defined`, where the component's real runtime import was relocated into the literal) and a string-corruption bug (`@barefootjs/client` rewritten to `./barefoot.js` inside snippet text).
