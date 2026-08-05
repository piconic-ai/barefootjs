// Project path defaults consumed by registry tooling (`bf add`, `search`,
// `meta:extract`, etc.) — see `context.ts`'s `configFromViteConfig` for how
// a project's `vite.config.ts` is read alongside these.

import type { BarefootPaths } from '@barefootjs/jsx'

export type { BarefootPaths } from '@barefootjs/jsx'

/** Default paths layout — the barefoot Vite plugin has no `paths` option, so this is always used. */
export const DEFAULT_PATHS: BarefootPaths = {
  components: 'components/ui',
  tokens: 'tokens',
  meta: 'meta',
}
