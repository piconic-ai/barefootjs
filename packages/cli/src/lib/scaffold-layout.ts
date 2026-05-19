// Shared layout resolver for `bf gen *` commands.
//
// `bf gen component` / `bf gen preview` need to know two things to put a
// new file in the right place:
//
//   - `writeRoot`            : the absolute base directory to write under.
//                              In the monorepo this is `ctx.root` (the
//                              monorepo checkout); in a scaffolded app it's
//                              `ctx.projectDir` (where the user's barefoot
//                              project lives). Pre-fix code always used
//                              `ctx.root`, which in scaffolded apps
//                              resolved to `node_modules/`, polluting it
//                              with user code that the next `npm install`
//                              would wipe.
//
//   - `componentsBasePath`   : project-root-relative dir where the new
//                              component lands. Monorepo: `ui/components/ui`
//                              (the registry layout). Scaffolded app:
//                              `barefoot.config.ts`'s `paths.components`
//                              (typically `components/ui`).
//
// Keeping both behind one helper means future `bf gen *` commands stay
// scaffold-aware by construction.

import type { CliContext } from '../context'

export interface ScaffoldLayout {
  writeRoot: string
  componentsBasePath: string
}

export function resolveScaffoldLayout(ctx: CliContext): ScaffoldLayout {
  if (ctx.config && ctx.projectDir) {
    return {
      writeRoot: ctx.projectDir,
      componentsBasePath: ctx.config.paths.components,
    }
  }
  return {
    writeRoot: ctx.root,
    componentsBasePath: 'ui/components/ui',
  }
}
