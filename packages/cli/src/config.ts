// Project path defaults consumed by registry tooling (`bf add`, `search`,
// `meta:extract`, etc.) — see `context.ts` for how these merge with a
// project's `vite.config.ts`.

import type { BarefootPaths } from '@barefootjs/jsx'

export type { BarefootPaths } from '@barefootjs/jsx'

/** Default paths layout used when `vite.config.ts`'s barefoot plugin has no `paths` override. */
export const DEFAULT_PATHS: BarefootPaths = {
  components: 'components/ui',
  tokens: 'tokens',
  meta: 'meta',
}
