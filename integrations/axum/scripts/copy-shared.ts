/**
 * Post-build step that stages the shared design-system stylesheets under
 * `dist/styles` so the same layout works in local dev (`cargo run` from this
 * directory) and inside the container image (`WORKDIR /app`, `dist/` copied
 * in verbatim — see `Dockerfile`). No language runtime needs vendoring here
 * (unlike `integrations/flask`'s `assemble-deps.ts`, which also stages the
 * Python BarefootJS package): the Rust runtime is a compiled `Cargo.toml`
 * path dependency, resolved at build time, not staged at deploy time.
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
