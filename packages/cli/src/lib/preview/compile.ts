// Preview compiler pipeline (CSR mode)
//
// Compiles the preview file and its component dependencies to client JS
// via the barefoot compiler, then bundles for the browser. Components are
// rendered client-side with the runtime's render() — full reactivity, no
// SSR server. Uses CSRAdapter (no Hono dependency).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, relative } from 'node:path'
import { build } from 'esbuild'
import {
  compileJSX,
  combineParentChildClientJs,
  formatError,
  BaseAdapter,
  type AdapterOutput,
} from '@barefootjs/jsx'
import { discoverComponentFiles } from '../build'

// Minimal CSR adapter. compileJSX needs a concrete TemplateAdapter, but
// preview only consumes the client JS output (the marked template is
// discarded), so every render method is a no-op. Defined inline — rather
// than importing CSRAdapter from `@barefootjs/client/build` — so the CLI
// bundles from `@barefootjs/jsx` source alone and does not require
// `@barefootjs/client`'s dist to be built first. `acceptsTemplateCall`
// returns true so the analyzer keeps calls at template scope (matches
// the published CSRAdapter contract).
const EMPTY_OUTPUT: AdapterOutput = Object.freeze({
  template: '',
  sections: Object.freeze({ imports: '', types: '', component: '', defaultExport: '' }),
  extension: '.tsx',
})

class PreviewCsrAdapter extends BaseAdapter {
  name = 'csr'
  extension = '.tsx'
  acceptsTemplateCall = (): boolean => true
  generate(): AdapterOutput { return EMPTY_OUTPUT }
  renderNode(): string { return '' }
  renderElement(): string { return '' }
  renderExpression(): string { return '' }
  renderConditional(): string { return '' }
  renderLoop(): string { return '' }
  renderComponent(): string { return '' }
  renderScopeMarker(): string { return '' }
  renderSlotMarker(): string { return '' }
  renderCondMarker(): string { return '' }
}

export interface CompileOptions {
  /** Repo/project root (absolute). */
  rootDir: string
  previewsPath: string
  previewNames: string[]
  componentName: string
}

export interface CompileResult {
  distDir: string
}

export async function compile(options: CompileOptions): Promise<CompileResult> {
  const { rootDir, previewsPath, previewNames, componentName } = options

  const UI_COMPONENTS_DIR = resolve(rootDir, 'ui/components')
  const DIST_DIR = resolve(rootDir, '.preview-dist')
  const MODULES_DIR = resolve(DIST_DIR, '_modules')

  await mkdir(MODULES_DIR, { recursive: true })

  // 1. Generate CSS from token JSON
  const { loadTokens, mergeTokenSets, generateCSS } = await import(
    resolve(rootDir, 'site/shared/tokens/index')
  )
  const baseTokens = await loadTokens(resolve(rootDir, 'site/shared/tokens/tokens.json'))
  const uiTokens = await loadTokens(resolve(rootDir, 'site/ui/tokens.json'))
  const mergedTokens = mergeTokenSets(baseTokens, uiTokens)
  const tokensCSS = generateCSS(mergedTokens)
  const globalsCSS = await readFile(resolve(rootDir, 'site/ui/styles/globals.css'), 'utf-8')
  await writeFile(resolve(DIST_DIR, 'globals.css'), tokensCSS + '\n' + globalsCSS)
  console.log('Generated: .preview-dist/globals.css')

  // 2. Generate UnoCSS. Resolve the bin from site/ui (the workspace that
  //    declares unocss + holds uno.config.ts), falling back to root.
  console.log('Generating UnoCSS...')
  const unocssbin = [
    resolve(rootDir, 'site/ui/node_modules/.bin/unocss'),
    resolve(rootDir, 'node_modules/.bin/unocss'),
  ].find(existsSync)
  if (!unocssbin) {
    throw new Error('unocss CLI not found in site/ui or root node_modules — run `bun install`')
  }
  execFileSync(unocssbin, [
    '../../ui/components/**/*.tsx', './**/*.tsx', './dist/**/*.tsx',
    '-o', resolve(DIST_DIR, 'uno.css'),
  ], { cwd: resolve(rootDir, 'site/ui'), stdio: 'inherit' })
  console.log('Generated: .preview-dist/uno.css')

  // 3. Compile preview file + all component dependencies to client JS
  console.log('Compiling components...')
  const componentFiles = await discoverComponentFiles(UI_COMPONENTS_DIR, {
    skipDirs: ['__previews__', '__tests__', 'shared'],
  })
  const allFiles = [...componentFiles, previewsPath]
  const adapter = new PreviewCsrAdapter()

  // Map<unique key, clientJs> for combineParentChildClientJs.
  // Track the preview file's own compile result so we can fail loudly
  // if it didn't produce a registerable module (otherwise the page
  // would silently throw "Component not registered" at runtime).
  const previewKey = relative(rootDir, previewsPath).replace(/\.tsx$/, '')
  const clientJsByKey = new Map<string, string>()
  let previewProducedClientJs = false
  for (const filePath of allFiles) {
    const source = await readFile(filePath, 'utf-8')
    const isPreview = filePath === previewsPath
    const result = compileJSX(source, filePath, { adapter })
    const errors = result.errors.filter(e => e.severity === 'error')
    const warnings = result.errors.filter(e => e.severity === 'warning')
    for (const w of warnings) console.warn(formatError(w, source, { projectDir: rootDir }))
    if (errors.length > 0) {
      for (const e of errors) console.error(formatError(e, source, { projectDir: rootDir }))
      if (isPreview) {
        throw new Error(`Preview compilation failed for ${previewKey} (see errors above).`)
      }
      continue
    }
    const clientJs = result.files.find(f => f.type === 'clientJs')?.content
    if (!clientJs) continue
    const key = relative(rootDir, filePath).replace(/\.tsx$/, '')
    clientJsByKey.set(key, clientJs)
    if (isPreview) previewProducedClientJs = true
  }

  if (!previewProducedClientJs) {
    throw new Error(
      `Preview ${previewKey} produced no client JS. Each preview function must ` +
      `return a single root element (wrap multiple roots in <>...</>).`,
    )
  }

  // 4. Inline parent-child client JS (resolves @bf-child markers).
  //    combineParentChildClientJs only returns entries that changed
  //    (those with @bf-child placeholders), so merge it over the full
  //    set: combined entries win, leaf/childless modules are retained.
  const combined = combineParentChildClientJs(clientJsByKey)
  const allModules = new Map([...clientJsByKey, ...combined])

  // 5. Write every module as an importable JS file.
  for (const [key, content] of allModules) {
    const safeName = key.replace(/[/\\]/g, '__') + '.js'
    await writeFile(resolve(MODULES_DIR, safeName), content)
  }
  // The preview module transitively inlines its @bf-child dependencies,
  // so importing it alone registers everything the previews render —
  // no need to bundle the other (heavily overlapping) modules.
  const previewModuleFile = previewKey.replace(/[/\\]/g, '__') + '.js'

  // 6. Generate browser entry: register the preview module, render each preview
  const entrySource = generateEntryScript(previewModuleFile, previewNames)
  const entryPath = resolve(DIST_DIR, '_entry.js')
  await writeFile(entryPath, entrySource)

  // 7. Bundle with esbuild. Alias the runtime to the self-contained
  //    standalone bundle so it resolves to a single shared instance.
  console.log('Bundling for browser...')
  const runtimeStandalone = resolve(rootDir, 'packages/client/dist/runtime/standalone.js')
  if (!existsSync(runtimeStandalone)) {
    console.log('Building @barefootjs/client runtime...')
    execFileSync('bun', ['run', 'build'], {
      cwd: resolve(rootDir, 'packages/client'),
      stdio: 'inherit',
    })
  }
  await build({
    entryPoints: [entryPath],
    outfile: resolve(DIST_DIR, '_bundle.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    minify: false,
    sourcemap: 'inline',
    absWorkingDir: rootDir,
    alias: { '@barefootjs/client/runtime': runtimeStandalone },
    define: { 'process.env.NODE_ENV': '"development"' },
  })
  console.log('Generated: .preview-dist/_bundle.js')

  // 8. Generate index.html
  await writeFile(resolve(DIST_DIR, 'index.html'), generateHTML(componentName))
  console.log('Generated: .preview-dist/index.html')

  return { distDir: DIST_DIR }
}

function generateEntryScript(
  previewModuleFile: string,
  previewNames: string[],
): string {
  // Side-effect import: running the preview module executes its hydrate()
  // calls, registering the preview functions and their inlined deps.
  const namesJson = JSON.stringify(previewNames)
  return `import { render } from '@barefootjs/client/runtime'
import './_modules/${previewModuleFile}'

const previews = ${namesJson}
const app = document.getElementById('preview-root')

for (const name of previews) {
  const section = document.createElement('div')
  section.className = 'preview-section'
  section.dataset.preview = name

  const title = document.createElement('div')
  title.className = 'preview-title'
  title.textContent = name.replace(/([a-z])([A-Z])/g, '$1 $2')
  section.appendChild(title)

  const content = document.createElement('div')
  section.appendChild(content)
  app.appendChild(section)

  try {
    render(content, name, {})
  } catch (err) {
    content.textContent = 'Render error: ' + (err && err.message || err)
    console.error('[preview]', name, err)
  }
}
`
}

function generateHTML(componentName: string): string {
  const displayName = componentName.charAt(0).toUpperCase() + componentName.slice(1)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${displayName} — Preview</title>
  <link rel="stylesheet" href="/globals.css" />
  <link rel="stylesheet" href="/uno.css" />
  <style>
    body {
      padding: 2rem;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .preview-section {
      margin-bottom: 2rem;
      padding: 1.5rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .preview-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--muted-foreground);
      margin-bottom: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
    }
    #bf-theme-toggle {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      z-index: 9999;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--foreground);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,.1);
    }
    #bf-theme-toggle:hover { background: var(--accent); }
    #bf-theme-toggle .sun { display: none; }
    #bf-theme-toggle .moon { display: block; }
    .dark #bf-theme-toggle .sun { display: block; }
    .dark #bf-theme-toggle .moon { display: none; }
  </style>
</head>
<body>
  <h1>${displayName}</h1>
  <div id="preview-root"></div>
  <button id="bf-theme-toggle" type="button" aria-label="Toggle dark mode"
    onclick="var r=document.documentElement;r.classList.add('theme-transition');r.classList.toggle('dark');setTimeout(function(){r.classList.remove('theme-transition')},300)">
    <svg class="sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
    </svg>
    <svg class="moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
  </button>
  <script type="module" src="/_bundle.js"></script>
</body>
</html>`
}
