---
"@barefootjs/router": minor
"@barefootjs/client": major
"@barefootjs/jsx": minor
"@barefootjs/cli": minor
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/hono": patch
---

Move `queryHref` to the router layer; remove its name recognition from the compiler core (#2057, part 3).

`queryHref` is a routing concern (it builds `<a href>` query URLs), so it now lives in `@barefootjs/router` instead of `@barefootjs/client`, and the compiler core no longer recognizes it by name. Recognition is registered by the router via the lowering-plugin registry (part 2). With `searchParams` (part 1) already structural, the compiler core now carries **no specific runtime-API names**.

**Breaking:**

- `queryHref` (and its `QueryParams` / `QueryParamValue` types) moved from `@barefootjs/client` to `@barefootjs/router`.

  ```tsx
  // before
  import { queryHref } from '@barefootjs/client'
  // after
  import { queryHref } from '@barefootjs/router'
  ```

- To lower `queryHref(base, { … })` to the server template, declare the router's lowering plugin in your build config's `plugins`:

  ```ts
  // barefoot.config.ts
  import { createConfig } from '@barefootjs/go-template/build'
  import { queryHrefPlugin } from '@barefootjs/router/plugins'

  export default createConfig({
    components: ['...'],
    plugins: [queryHrefPlugin],
  })
  ```

  Without it, a `queryHref(...)` call in a component hits the support gate (BF101), because the compiler core no longer knows the name. `queryHref`'s runtime behavior is unchanged; it remains a pure function that also runs during SSR.

**Browser serving:** when `@barefootjs/router` is installed, the CLI now copies its standalone bundle to `router.js` next to `barefoot.js` and rewrites island `@barefootjs/router` imports (and the importmap entry) to it — so an island's `queryHref` resolves in the browser exactly like `@barefootjs/client` → `barefoot.js`.

**Internal:** the `'queryHref'` entry left `CLIENT_EXPORTS`, and `queryHrefLocalNames` / `QUERY_HREF_SOURCES` were removed from `@barefootjs/jsx` (the router owns that resolution now). The shared `matchQueryHrefCall` / `queryHrefArgs` helpers stay in `@barefootjs/jsx` as generic guard-list utilities the router plugin builds on. `BuildOptions` gains a `plugins?: LoweringPlugin[]` field that adapter `createConfig`s register.
