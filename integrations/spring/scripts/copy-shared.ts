/**
 * Post-build step that stages the shared design-system stylesheets under
 * `dist/styles` so the same layout works in local dev (`gradle bootRun` from
 * this directory) and inside the container image (`WORKDIR /app`, `dist/`
 * copied in verbatim — see `Dockerfile`). No language runtime needs
 * vendoring here: the Pebble Java runtime is a Gradle composite-build
 * project dependency, resolved at build time, not staged at deploy time.
 * Port of `integrations/axum/scripts/copy-shared.ts`.
 *
 *   ./dist/styles  ← integrations/shared/styles (design-system stylesheets)
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

await mirror(join(ROOT, '../shared/styles'), join(ROOT, 'dist/styles'))
