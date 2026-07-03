/**
 * Post-build step that stages the Python BarefootJS runtime and shared
 * styles under the flask example directory so the same layout works in
 * local dev and inside the container image.
 *
 *   ./lib          ← packages/adapter-jinja/python/barefootjs (engine-agnostic
 *                    runtime + Jinja2 backend, one Python package). The app
 *                    runs with `PYTHONPATH=./lib` so `import barefootjs`
 *                    resolves here in both dev and the container.
 *   ./dist/styles  ← integrations/shared/styles  (design-system stylesheets)
 */

import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

async function mirror(src: string, dest: string) {
  await rm(dest, { recursive: true, force: true })
  await mkdir(dirname(dest), { recursive: true })
  await cp(src, dest, { recursive: true })
  console.log(`Copied ${src} → ${dest.replace(ROOT + '/', '')}`)
}

const LIB_DEST = join(ROOT, 'lib', 'barefootjs')
await mirror(join(ROOT, '../../packages/adapter-jinja/python/barefootjs'), LIB_DEST)

await mirror(join(ROOT, '../shared/styles'), join(ROOT, 'dist/styles'))
