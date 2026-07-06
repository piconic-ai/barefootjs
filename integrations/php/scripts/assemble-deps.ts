/**
 * Post-build step that stages the PHP BarefootJS runtime SOURCE and shared
 * styles under the PHP example directory so the same layout works in local
 * dev and inside the container image.
 *
 *   ./lib/barefootjs-php/src  ← packages/adapter-php/src (engine-agnostic
 *                    runtime: `Barefoot\BarefootJS`, `Evaluator`,
 *                    `SearchParams`, `Json` -- plain PHP source, no vendor/
 *                    or tests/ copied, only what a consuming app needs).
 *   ./lib/barefootjs-twig/src ← packages/adapter-twig/php/src (the Twig
 *                    backend: `Barefoot\TwigBackend` + `naming.php`).
 *   ./dist/styles            ← integrations/shared/styles (design-system
 *                    stylesheets).
 *
 * Composer wiring (see composer.json in this directory): rather than path
 * repositories (which would make `composer install` reach back into
 * packages/adapter-php and packages/adapter-twig/php -- awkward for a
 * container build that only COPYs this directory), this integration's own
 * composer.json declares `psr-4` autoload entries (plus the `naming.php`
 * `files` autoload entry) pointing at the two copies this script stages, and
 * requires `twig/twig` directly from Packagist. `composer install` (run as
 * the last step of `bun run build`, see package.json) then produces a single
 * self-contained `vendor/autoload.php` covering the runtime classes, the
 * Twig backend, AND Twig itself -- the simplest wiring that survives being
 * copied wholesale into a Docker image with no reference back to the
 * monorepo.
 *
 * `index.php` requires `vendor/autoload.php` first (the assembled/composer
 * path used in the container and after a full `bun run build`), falling back
 * to `../../packages/adapter-twig/php/vendor/autoload.php` (the workspace
 * package's OWN already-composer-installed autoload, which resolves both
 * copies via its `barefootjs/runtime` path-repo dependency and covers Twig
 * too) for local dev before `composer install` has been run here.
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

await mirror(join(ROOT, '../../packages/adapter-php/src'), join(ROOT, 'lib', 'barefootjs-php', 'src'))
await mirror(join(ROOT, '../../packages/adapter-twig/php/src'), join(ROOT, 'lib', 'barefootjs-twig', 'src'))

await mirror(join(ROOT, '../shared/styles'), join(ROOT, 'dist/styles'))
