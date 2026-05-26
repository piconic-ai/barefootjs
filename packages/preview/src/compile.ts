// Preview compiler pipeline (CSR mode)
//
// Bundles preview files for client-side rendering using Bun.build()
// with a custom DOM-based JSX runtime. No Hono SSR at serve time.

import { mkdir, readdir } from 'node:fs/promises'
import { resolve, relative, dirname } from 'node:path'
import {
  hasUseClientDirective,
  discoverComponentFiles,
} from '../../cli/src/lib/build'

const ROOT_DIR = resolve(import.meta.dir, '../../..')
const UI_COMPONENTS_DIR = resolve(ROOT_DIR, 'ui/components')
const DIST_DIR = resolve(ROOT_DIR, '.preview-dist')
const DOM_PKG_DIR = resolve(ROOT_DIR, 'packages/client')
const JSX_RUNTIME_PATH = resolve(import.meta.dir, 'jsx-runtime.ts')

export interface CompileOptions {
  previewsPath: string
  previewNames: string[]
  componentName: string
}

export interface CompileResult {
  distDir: string
}

export async function compile(options: CompileOptions): Promise<CompileResult> {
  const { previewsPath, previewNames, componentName } = options

  await mkdir(DIST_DIR, { recursive: true })

  // 1. Copy barefoot.js runtime (for future interactive component support)
  const domDistFile = resolve(DOM_PKG_DIR, 'dist/runtime/standalone.js')
  if (!await Bun.file(domDistFile).exists()) {
    console.log('Building @barefootjs/client...')
    const proc = Bun.spawn(['bun', 'run', 'build'], { cwd: DOM_PKG_DIR })
    await proc.exited
  }
  await Bun.write(resolve(DIST_DIR, 'barefoot.js'), Bun.file(domDistFile))
  console.log('Generated: .preview-dist/barefoot.js')

  // 2. Generate CSS from token JSON
  const { loadTokens, mergeTokenSets, generateCSS } = await import(
    resolve(ROOT_DIR, 'site/shared/tokens/index')
  )
  const baseTokens = await loadTokens(resolve(ROOT_DIR, 'site/shared/tokens/tokens.json'))
  const uiTokens = await loadTokens(resolve(ROOT_DIR, 'site/ui/tokens.json'))
  const mergedTokens = mergeTokenSets(baseTokens, uiTokens)
  const tokensCSS = generateCSS(mergedTokens)
  const globalsCSS = await Bun.file(resolve(ROOT_DIR, 'site/ui/styles/globals.css')).text()
  await Bun.write(resolve(DIST_DIR, 'globals.css'), tokensCSS + '\n' + globalsCSS)
  console.log('Generated: .preview-dist/globals.css')

  // 3. Generate UnoCSS
  console.log('Generating UnoCSS...')
  const unoProc = Bun.spawn(
    ['bunx', 'unocss', '../../ui/components/**/*.tsx', './**/*.tsx', './dist/**/*.tsx',
     '-o', resolve(DIST_DIR, 'uno.css')],
    {
      cwd: resolve(ROOT_DIR, 'site/ui'),
      stdout: 'inherit',
      stderr: 'inherit',
    }
  )
  await unoProc.exited
  console.log('Generated: .preview-dist/uno.css')

  // 4. Generate browser entry point that imports previews and mounts them
  const entrySource = generateEntryScript(previewsPath, previewNames, componentName)
  const entryPath = resolve(DIST_DIR, '_entry.tsx')
  await Bun.write(entryPath, entrySource)

  // 5. Bundle with Bun.build() using our DOM-based JSX runtime
  console.log('Bundling for browser...')
  const buildResult = await Bun.build({
    entrypoints: [entryPath],
    outdir: DIST_DIR,
    target: 'browser',
    minify: false,
    sourcemap: 'inline',
    define: {
      'process.env.NODE_ENV': '"development"',
    },
    plugins: [jsxRuntimePlugin()],
  })

  if (!buildResult.success) {
    console.error('Bundle errors:')
    for (const log of buildResult.logs) {
      console.error(log)
    }
    throw new Error('Bundle failed')
  }
  console.log('Generated: .preview-dist/_entry.js')

  // 6. Generate index.html
  const html = generateHTML(componentName, previewNames)
  await Bun.write(resolve(DIST_DIR, 'index.html'), html)
  console.log('Generated: .preview-dist/index.html')

  return { distDir: DIST_DIR }
}

function generateEntryScript(
  previewsPath: string,
  previewNames: string[],
  componentName: string,
): string {
  const importPath = previewsPath
  const names = previewNames.join(', ')
  return `
import { mount } from '${JSX_RUNTIME_PATH}'
import { ${names} } from '${importPath}'

const previews = { ${names} }
const app = document.getElementById('preview-root')!

for (const [name, Preview] of Object.entries(previews)) {
  const section = document.createElement('div')
  section.className = 'preview-section'
  section.dataset.preview = name

  const title = document.createElement('div')
  title.className = 'preview-title'
  title.textContent = name.replace(/([a-z])([A-Z])/g, '$1 $2')
  section.appendChild(title)

  const content = document.createElement('div')
  mount((Preview as Function)(), content)
  section.appendChild(content)

  app.appendChild(section)
}
`
}

function generateHTML(componentName: string, previewNames: string[]): string {
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
  <script type="module" src="/_entry.js"></script>
</body>
</html>`
}

// Bun plugin: rewrite JSX import source to our DOM runtime for all
// component files (they have no pragma, so Bun uses the configured default).
// Files with an explicit @jsxImportSource pragma are left alone, but
// we strip "use client" directives since they're meaningless in CSR.
function jsxRuntimePlugin(): import('bun').BunPlugin {
  return {
    name: 'preview-jsx',
    setup(build) {
      build.onLoad({ filter: /\.tsx$/ }, async (args) => {
        let contents = await Bun.file(args.path).text()

        // Strip "use client" directive
        contents = contents.replace(/^['"]use client['"];?\s*\n?/m, '')

        // Strip existing @jsxImportSource pragmas
        contents = contents.replace(/\/\*\*?\s*@jsxImportSource\s+[^\s*]+\s*\*\//g, '')

        // Add our JSX runtime pragma
        contents = `/** @jsxImportSource ${JSX_RUNTIME_PATH.replace(/\/jsx-runtime\.ts$/, '')} */\n${contents}`

        return { contents, loader: 'tsx' }
      })
    },
  }
}
