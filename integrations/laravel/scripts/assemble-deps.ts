/**
 * Post-build step that stages the PHP BarefootJS runtime SOURCE and shared
 * styles under the Laravel example directory so the same layout works in
 * local dev and inside the container image.
 *
 *   ./lib/barefootjs-php/src   ← packages/adapter-php/src (engine-agnostic
 *                    runtime: `Barefoot\BarefootJS`, `Evaluator`,
 *                    `SearchParams`, `Json` -- plain PHP source, no vendor/
 *                    or tests/ copied, only what a consuming app needs).
 *   ./lib/barefootjs-blade/src ← packages/adapter-blade/php/src (the Blade
 *                    backend: `Barefoot\BladeBackend` + `naming.php`).
 *   ./dist/styles              ← integrations/shared/styles (design-system
 *                    stylesheets).
 *
 * Composer wiring (see composer.json in this directory): identical to
 * integrations/blade's -- `psr-4` autoload entries (plus the `naming.php`
 * `files` entry) point at the two copies this script stages, and
 * laravel/framework comes straight from Packagist (it brings illuminate/view
 * with it, so unlike the plain-PHP sibling there is no separate
 * illuminate/view requirement). `composer install` (the last step of
 * `bun run build`) produces a single self-contained `vendor/autoload.php`
 * covering the runtime classes, the Blade backend, AND the framework -- the
 * simplest wiring that survives being copied wholesale into a Docker image
 * with no reference back to the monorepo. There is no workspace autoload
 * fallback here (nothing in the monorepo vendors laravel/framework), which
 * is why artisan/public/index.php hard-fail with a "run `bun run build`"
 * hint when vendor/ is missing.
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
await mirror(join(ROOT, '../../packages/adapter-blade/php/src'), join(ROOT, 'lib', 'barefootjs-blade', 'src'))

await mirror(join(ROOT, '../shared/styles'), join(ROOT, 'dist/styles'))
