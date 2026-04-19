/**
 * Copy ../shared/styles into ./dist/shared/styles so the Go server and the
 * container image can serve them from a single root (dist/) under the same
 * URL path in dev and in production.
 */

import { cp, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SRC = join(ROOT, '../shared/styles')
const DEST = join(ROOT, 'dist/shared/styles')

await rm(DEST, { recursive: true, force: true })
await mkdir(dirname(DEST), { recursive: true })
await cp(SRC, DEST, { recursive: true })

console.log(`Copied ${SRC} → dist/shared/styles`)
