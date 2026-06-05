/**
 * Post-build step that stages Perl sources and shared styles under the
 * mojolicious example directory so the same layout works in local dev and
 * inside the container image.
 *
 *   ./lib          ← packages/adapter-perl/lib (engine-agnostic BarefootJS runtime)
 *                  + packages/adapter-mojolicious/lib (Mojo backend + plugin)
 *                    merged into one @INC dir so `use BarefootJS` and
 *                    `use BarefootJS::Backend::Mojo` both resolve.
 *   ./dist/styles  ← integrations/shared/styles  (design-system stylesheets)
 */

import { cp, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

async function mirror(src: string, dest: string) {
  await rm(dest, { recursive: true, force: true })
  await mkdir(dirname(dest), { recursive: true })
  await cp(src, dest, { recursive: true })
  console.log(`Copied ${src} → ${dest.replace(ROOT + '/', '')}`)
}

// Merge both packages' `lib/` into a single ./lib @INC root. Unlike `mirror`,
// `merge` must not `rm` between copies so the core runtime (BarefootJS.pm from
// @barefootjs/perl) and the Mojo binding (BarefootJS/Backend/Mojo.pm +
// Mojolicious/Plugin/* from @barefootjs/mojolicious) coexist in one tree.
async function merge(src: string, dest: string) {
  await mkdir(dest, { recursive: true })
  await cp(src, dest, { recursive: true })
  console.log(`Merged ${src} → ${dest.replace(ROOT + '/', '')}`)
}

const LIB_DEST = join(ROOT, 'lib')
await rm(LIB_DEST, { recursive: true, force: true })
await merge(join(ROOT, '../../packages/adapter-perl/lib'), LIB_DEST)
await merge(join(ROOT, '../../packages/adapter-mojolicious/lib'), LIB_DEST)

await mirror(join(ROOT, '../shared/styles'), join(ROOT, 'dist/styles'))
