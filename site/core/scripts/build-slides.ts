/**
 * Build one or more peitho slide decks into public/slides/<slug>/.
 *
 *   bun run slides:build <slug> [<slug>...]   build the named decks
 *   bun run slides:build --all                build every deck under slides/
 *
 * Convention (one directory per deck, see slides/README.md):
 *   slides/<slug>/deck.md          required — the peitho deck (layouts/, css/ next to it are
 *                                  picked up by peitho's zero-config asset lookup)
 *   slides/<slug>/slide.json       optional — { "title": "..." } for the page <title>
 *   slides/<slug>/assets/          optional — media copied verbatim into the output's assets/
 *                                  (*.md files such as SOURCES.md are skipped)
 *   slides/<slug>/component/       optional — a Vite project (barefoot() + CSRAdapter) whose
 *                                  non-component entries are bundled into assets/deck.js and
 *                                  injected into index.html
 *
 * The output (public/slides/<slug>/) is gitignored: deploy.yml installs a pinned peitho
 * release and runs `bun run slides:build --all` before the site build, and ci-slides.yml
 * does the same on pull requests. Set PEITHO to the binary path when it is not on PATH.
 */
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SLIDES_DIR = resolve(CORE_DIR, 'slides')
const OUT_ROOT = resolve(CORE_DIR, 'public', 'slides')
const PEITHO = process.env.PEITHO ?? 'peitho'

function run(cmd: string[], cwd: string): void {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if (proc.exitCode !== 0) {
    console.error(`\n✗ ${cmd.join(' ')} (in ${cwd}) exited with ${proc.exitCode}`)
    process.exit(proc.exitCode || 1)
  }
}

function listDecks(): string[] {
  return readdirSync(SLIDES_DIR)
    .filter((name) => statSync(join(SLIDES_DIR, name)).isDirectory() && existsSync(join(SLIDES_DIR, name, 'deck.md')))
    .sort()
}

function buildDeck(slug: string): void {
  const src = join(SLIDES_DIR, slug)
  const out = join(OUT_ROOT, slug)
  if (!existsSync(join(src, 'deck.md'))) {
    console.error(`✗ slides/${slug}/deck.md not found`)
    process.exit(1)
  }
  console.log(`\n▸ ${slug}`)

  // 1. peitho: viewer + slides + css (rewrites index.html from scratch every time)
  run([PEITHO, 'build', 'deck.md', '--out', out], src)

  // 2. media assets
  const assetsSrc = join(src, 'assets')
  const assetsOut = join(out, 'assets')
  mkdirSync(assetsOut, { recursive: true })
  if (existsSync(assetsSrc)) {
    for (const f of readdirSync(assetsSrc)) {
      if (f.endsWith('.md')) continue
      cpSync(join(assetsSrc, f), join(assetsOut, f), { recursive: true })
    }
  }

  // 3. interactive components → assets/deck.js
  let indexHtml = readFileSync(join(out, 'index.html'), 'utf8')
  const componentDir = join(src, 'component')
  if (existsSync(join(componentDir, 'package.json'))) {
    run(['bunx', 'vite', 'build'], componentDir)
    const manifest = JSON.parse(readFileSync(join(componentDir, 'dist', '.vite', 'manifest.json'), 'utf8')) as Record<string, { file: string; isEntry?: boolean }>
    // The barefoot() plugin adds one entry per component; the deck's own entries (mount, chrome)
    // import those, so only non-component entries are bundled. One entry → one runtime instance.
    const entries = Object.entries(manifest)
      .filter(([key, v]) => v.isEntry && !key.startsWith('components/'))
      .map(([, v]) => `import './${v.file}'`)
    if (entries.length === 0) {
      console.error(`✗ slides/${slug}/component: no non-component entry in vite manifest`)
      process.exit(1)
    }
    writeFileSync(join(componentDir, 'dist', 'entry.js'), entries.join('\n') + '\n')
    run(['bun', 'build', 'dist/entry.js', '--bundle', '--format=esm', '--minify', `--outfile=${join(assetsOut, 'deck.js')}`], componentDir)
    indexHtml = indexHtml.replace('<head>', '<head>\n  <script type="module" src="assets/deck.js"></script>')
  }

  // 4. page title (peitho writes "Peitho Deck")
  const metaPath = join(src, 'slide.json')
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { title?: string }
    if (meta.title) indexHtml = indexHtml.replace('<title>Peitho Deck</title>', `<title>${escapeHtml(meta.title)}</title>`)
  }
  writeFileSync(join(out, 'index.html'), indexHtml)

  // 5. repo facts a deck may quote: %%COMPAT_COMPONENTS%% / %%COMPAT_ADAPTERS%% are replaced
  //    with the counts from ui/compat.lock.json (the same source as the landing page's
  //    matrix), so a deck never carries a hand-typed component count that drifts.
  const facts = compatFacts()
  for (const f of ['index.html', 'manifest.json', ...readdirSync(join(out, 'slides')).map((n) => join('slides', n))]) {
    const path = join(out, f)
    if (!existsSync(path)) continue
    const before = readFileSync(path, 'utf8')
    const after = before.replaceAll('%%COMPAT_COMPONENTS%%', String(facts.components)).replaceAll('%%COMPAT_ADAPTERS%%', String(facts.adapters))
    if (after !== before) writeFileSync(path, after)
  }

  // 6. peitho copies its built-in theme fonts even when the deck ships its own css
  const css = readFileSync(join(out, 'peitho.css'), 'utf8')
  if (!css.includes('theme-fonts/')) rmSync(join(out, 'theme-fonts'), { recursive: true, force: true })

  console.log(`✓ public/slides/${slug}/`)
}

/** Component and adapter counts from the committed compat matrix (ui/compat.lock.json). */
function compatFacts(): { components: number; adapters: number } {
  const lock = JSON.parse(readFileSync(resolve(CORE_DIR, '../../ui/compat.lock.json'), 'utf8')) as { components: Record<string, unknown>; adapters: unknown[] | Record<string, unknown> }
  return { components: Object.keys(lock.components).length, adapters: Array.isArray(lock.adapters) ? lock.adapters.length : Object.keys(lock.adapters).length }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

const args = process.argv.slice(2)
const slugs = args.includes('--all') ? listDecks() : args.filter((a) => !a.startsWith('-'))
if (slugs.length === 0) {
  console.error('usage: bun run slides:build <slug> [<slug>...] | --all\navailable: ' + (listDecks().join(', ') || '(none)'))
  process.exit(1)
}
for (const slug of slugs) buildDeck(slug)
