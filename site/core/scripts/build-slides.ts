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
 * The output (public/slides/<slug>/) is gitignored and rebuilt by `bun run build` (see
 * build.ts), which invokes `--all` as its first step. deploy.yml and ci-slides.yml install a
 * pinned peitho release before that, so it is always present there. On a plain local `bun run
 * build` peitho commonly isn't installed, so `--all` degrades to a skip-with-warning instead
 * of failing the whole build — an explicit slug (`slides:build overview`) still hard-fails,
 * since that's a deliberate request to build one deck, not an incidental part of `build`. Set
 * PEITHO to the binary path when it is not on PATH.
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

  // 5. peitho copies its built-in theme fonts even when the deck ships its own css
  const css = readFileSync(join(out, 'peitho.css'), 'utf8')
  if (!css.includes('theme-fonts/')) rmSync(join(out, 'theme-fonts'), { recursive: true, force: true })

  console.log(`✓ public/slides/${slug}/`)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

const args = process.argv.slice(2)
const isAllMode = args.includes('--all')

if (isAllMode && !Bun.which(PEITHO)) {
  console.warn(`⚠ peitho not found (looked for "${PEITHO}" — set PEITHO=<path> if it's installed elsewhere).`)
  console.warn(`  Skipping slide deck build; dist/slides/ will be empty. Install peitho to build them locally:`)
  console.warn(`  https://github.com/mizzy/peitho/releases`)
  process.exit(0)
}

const slugs = isAllMode ? listDecks() : args.filter((a) => !a.startsWith('-'))
if (slugs.length === 0) {
  console.error('usage: bun run slides:build <slug> [<slug>...] | --all\navailable: ' + (listDecks().join(', ') || '(none)'))
  process.exit(1)
}
for (const slug of slugs) buildDeck(slug)
