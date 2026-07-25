/**
 * Compile TaggedTodoTable with the Hono adapter and SSR-render every
 * audit scenario to `out/`.
 *
 *   bun run explorations/tagged-todo/harness/compile.ts
 *
 * Outputs:
 *   out/client.js          — compiled client bundle (hydration side)
 *   out/template.tsx       — marked template (inspection aid)
 *   out/ssr-<scenario>.html — fresh SSR render per scenario state
 *   out/diagnostics.json   — compiler errors/warnings
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileJSX } from '../../../packages/jsx/src/index'
import { HonoAdapter } from '../../../packages/adapter-hono/src/adapter/index'
import { renderHonoComponent } from '../../../packages/adapter-hono/src/test-render'
import { scenarios } from './states'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../out')
mkdirSync(OUT, { recursive: true })

const source = await Bun.file(resolve(HERE, '../TaggedTodoTable.tsx')).text()

const compiled = compileJSX(source, 'TaggedTodoTable.tsx', { adapter: new HonoAdapter() })
writeFileSync(
  resolve(OUT, 'diagnostics.json'),
  JSON.stringify(compiled.errors, null, 2),
)
for (const e of compiled.errors) {
  console.log(`[diag] ${e.severity} ${e.code ?? ''}: ${e.message}`)
}

const clientJs = compiled.files.find(f => f.type === 'clientJs')
const template = compiled.files.find(f => f.type === 'markedTemplate')
if (!clientJs || !template) {
  throw new Error(`compile produced no ${clientJs ? 'markedTemplate' : 'clientJs'}`)
}
writeFileSync(resolve(OUT, 'client.js'), clientJs.content)
writeFileSync(resolve(OUT, 'template.tsx'), template.content)
console.log(`client.js ${clientJs.content.length}B, template.tsx ${template.content.length}B`)

for (const sc of scenarios) {
  const html = await renderHonoComponent({
    source,
    adapter: new HonoAdapter(),
    props: {
      ...sc.props,
      initial: structuredClone(sc.todos),
      __instanceId: 'TaggedTodoTable_test',
    },
    componentName: 'TaggedTodoTable',
  })
  writeFileSync(resolve(OUT, `ssr-${sc.id}.html`), html.trim() + '\n')
  console.log(`ssr-${sc.id}.html ${html.length}B`)
}
