/**
 * Compiler plugins for the router layer (#2057). Explicit, config-declared
 * registration — no build-time side effects. Add the plugin to your build:
 *
 * ```ts
 * // barefoot.config.ts
 * import { queryHrefPlugin } from '@barefootjs/router/plugins'
 * export default createConfig({ components: [...], plugins: [queryHrefPlugin] })
 * ```
 *
 * so the SSR adapters lower a `queryHref(base, { … })` call — imported from
 * `@barefootjs/router` — to their query helper (`bf_query` / `bf->query` /
 * `$bf.query`). Without it the call hits the support gate (BF101): the compiler
 * core no longer recognizes `queryHref` by name; ownership of that recognition
 * lives here, in the router layer.
 *
 * Compiler-facing only — it imports `@barefootjs/jsx` and is never pulled into
 * the client bundle (the runtime `queryHref` lives in `./query-href.ts`).
 */

import {
  matchQueryHrefCall,
  type IRMetadata,
  type LoweringPlugin,
} from '@barefootjs/jsx'

/** The import source that binds the router's `queryHref`. */
const QUERY_HREF_SOURCE = '@barefootjs/router'

/**
 * Local binding name(s) `queryHref` is imported under from `@barefootjs/router`
 * in a component (handles `import { queryHref as qh }`). The router owns this
 * resolution now — the compiler core no longer hardcodes the name or source.
 */
function queryHrefLocalNames(metadata: IRMetadata): Set<string> {
  const names = new Set<string>()
  for (const imp of metadata.imports) {
    if (imp.source !== QUERY_HREF_SOURCE || imp.isTypeOnly) continue
    for (const s of imp.specifiers) {
      if (s.isTypeOnly || s.isNamespace || s.isDefault) continue
      if (s.name === 'queryHref') names.add(s.alias ?? s.name)
    }
  }
  return names
}

/**
 * Teaches the compiler to lower `queryHref(base, { … })` (imported from
 * `@barefootjs/router`) to each adapter's query helper. Pass it to your build
 * config's `plugins` array.
 */
export const queryHrefPlugin: LoweringPlugin = {
  name: 'queryHref',
  prepare(metadata) {
    const localNames = queryHrefLocalNames(metadata)
    if (localNames.size === 0) return null
    return (callee, args) => {
      const q = matchQueryHrefCall(callee, args, localNames)
      return q
        ? { kind: 'guard-list', helper: 'query', base: q.base, triples: q.triples }
        : null
    }
  },
}
