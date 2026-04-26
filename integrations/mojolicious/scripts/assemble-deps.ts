/**
 * Post-build step that stages Perl sources and shared styles under the
 * mojolicious example directory so the same layout works in local dev and
 * inside the container image.
 *
 *   ./lib          ← packages/adapter-mojolicious/lib (BarefootJS Mojo plugin)
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

await mirror(join(ROOT, '../../packages/adapter-mojolicious/lib'), join(ROOT, 'lib'))
await mirror(join(ROOT, '../shared/styles'), join(ROOT, 'dist/styles'))
