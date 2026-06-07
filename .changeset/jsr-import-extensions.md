---
"@barefootjs/jsx": patch
---

Fix Deno/JSR type-checking failures so `deno publish` succeeds for all
`@barefootjs/*` libraries.

- Add explicit `.ts`/`.tsx` extensions to relative imports across each
  published package's `src/` (Deno's ESM resolver does not implicitly
  append TypeScript extensions the way Bun/Node bundlers do; without
  this the publisher fails with `TS2307`).
- Switch Node built-in imports in `@barefootjs/jsx` (`path`, `fs`) to
  the `node:` prefix Deno requires for unambiguous specifier resolution.
- Enable `allowImportingTsExtensions: true` (with
  `emitDeclarationOnly: true` as its prerequisite) in each published
  package's `tsconfig.json` so TypeScript accepts the now-explicit
  extensions.

No consumer-facing API changes — the npm build still emits
`.js`/`.d.ts` artifacts identical to before; only the JSR-published
TypeScript source surface is affected.
