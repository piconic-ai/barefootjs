/**
 * Post-build step that stages the PHP BarefootJS runtime SOURCE and shared
 * styles under the PHP example directory so the same layout works in local
 * dev and inside the container image.
 *
 *   ./lib/barefootjs-php/src  ← packages/adapter-twig/php/src (engine-agnostic
 *                    runtime + Twig backend, plain PHP source -- no vendor/
 *                    or tests/ copied, only what a consuming app needs).
 *   ./dist/styles            ← integrations/shared/styles (design-system
 *                    stylesheets).
 *
 * Composer wiring (see composer.json in this directory): rather than a path
 * repository (which would make `composer install` reach back into
 * packages/adapter-twig/php -- awkward for a container build that only COPYs
 * this directory), this integration's own composer.json declares a
 * `psr-4: {"Barefoot\\": "lib/barefootjs-php/src/"}` autoload entry (plus the
 * `naming.php` `files` autoload entry) pointing at the copy this script
 * stages, and requires `twig/twig` directly from Packagist. `composer
 * install` (run as the last step of `bun run build`, see package.json) then
 * produces a single self-contained `vendor/autoload.php` covering BOTH the
 * runtime classes and Twig -- the simplest wiring that survives being copied
 * wholesale into a Docker image with no reference back to the monorepo.
 *
 * `index.php` requires `vendor/autoload.php` first (the assembled/composer
 * path used in the container and after a full `bun run build`), falling back
 * to `../../packages/adapter-twig/php/vendor/autoload.php` (the workspace
 * package's OWN already-composer-installed autoload, which also covers Twig)
 * for local dev before `composer install` has been run here.
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

const LIB_DEST = join(ROOT, 'lib', 'barefootjs-php', 'src')
await mirror(join(ROOT, '../../packages/adapter-twig/php/src'), LIB_DEST)

await mirror(join(ROOT, '../shared/styles'), join(ROOT, 'dist/styles'))
