/**
 * Generates the landing-page demo panels from REAL compiler output.
 *
 * The LP promises "what your server renders" — so the right-hand panels
 * must be the actual `compileJSX` (bf build) output for the source shown
 * in the left-hand panel, never hand-written approximations
 * (see design/LP-RENEWAL.md, 決定事項 6).
 *
 * Run from site/core:
 *   bun run landing/generate-demo-outputs.ts
 *
 * Writes landing/components/shared/demo-outputs.ts (committed) so the
 * Worker bundle stays static and reviewers can diff exactly what the LP
 * claims the compiler produces.
 */

import { compileJSX } from '@barefootjs/jsx'
import type { TemplateAdapter } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '@barefootjs/go-template/adapter'
import { ErbAdapter } from '@barefootjs/erb/adapter'
import { JinjaAdapter } from '@barefootjs/jinja/adapter'
import { MojoAdapter } from '@barefootjs/mojolicious/adapter'
import { TwigAdapter } from '@barefootjs/twig/adapter'
import { MinijinjaAdapter } from '@barefootjs/rust/adapter'
import { XslateAdapter } from '@barefootjs/xslate/adapter'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { resolve, dirname } from 'node:path'

const OUT_FILE = resolve(dirname(import.meta.path), 'components/shared/demo-outputs.ts')

interface DemoExample {
  /** Tab id used in the LP markup. */
  id: string
  /** Source filename shown in the left pane (also the compile filename). */
  file: string
  /** The exact source shown in the left panel. */
  source: string
}

/**
 * Demo sources. Every example must compile clean on every adapter below
 * (the generator fails the build otherwise).
 */
const EXAMPLES: DemoExample[] = [
  {
    id: 'counter',
    file: 'Counter.tsx',
    source: `"use client"

import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count()}
    </button>
  )
}
`,
  },
  {
    id: 'toggle',
    file: 'Toggle.tsx',
    source: `"use client"

import { createSignal } from '@barefootjs/client'

export function Toggle() {
  const [on, setOn] = createSignal(false)
  return (
    <button aria-pressed={on()} onClick={() => setOn(v => !v)}>
      {on() ? 'On' : 'Off'}
    </button>
  )
}
`,
  },
  {
    id: 'items',
    file: 'Items.tsx',
    source: `export function Items({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
`,
  },
]

interface DemoTarget {
  /** Tab id used in the LP markup. */
  id: string
  /** Tab label (the backend the visitor recognizes). */
  label: string
  /** Template filename extension (the adapter's own `extension`). */
  extension: string
  /** Shiki language for highlighting. */
  lang: string
  adapter: () => TemplateAdapter
}

const TARGETS: DemoTarget[] = [
  { id: 'go', label: 'go', extension: '.tmpl', lang: 'go-html-template', adapter: () => new GoTemplateAdapter() },
  { id: 'erb', label: 'rails', extension: '.erb', lang: 'erb', adapter: () => new ErbAdapter() },
  { id: 'jinja', label: 'django', extension: '.jinja', lang: 'jinja', adapter: () => new JinjaAdapter() },
  { id: 'ep', label: 'perl', extension: '.html.ep', lang: 'perl', adapter: () => new MojoAdapter() },
  { id: 'twig', label: 'php', extension: '.twig', lang: 'twig', adapter: () => new TwigAdapter() },
  { id: 'minijinja', label: 'rust', extension: '.j2', lang: 'jinja', adapter: () => new MinijinjaAdapter() },
  { id: 'xslate', label: 'xslate', extension: '.tx', lang: 'perl', adapter: () => new XslateAdapter() },
  { id: 'hono', label: 'hono', extension: '.tsx', lang: 'tsx', adapter: () => new HonoAdapter() },
]

interface DemoOutput {
  id: string
  label: string
  file: string
  lang: string
  code: string
}

interface CompiledExample {
  id: string
  file: string
  source: string
  outputs: DemoOutput[]
}

const examples: CompiledExample[] = []

for (const example of EXAMPLES) {
  const outputs: DemoOutput[] = []
  const baseName = example.file.replace('.tsx', '').toLowerCase()

  for (const target of TARGETS) {
    const adapter = target.adapter()
    const result = compileJSX(example.source, example.file, { adapter })

    const errors = result.errors.filter((e) => e.severity === 'error')
    if (errors.length > 0) {
      console.error(`Errors compiling ${example.file} for ${target.id}:`)
      for (const e of errors) console.error(`  ${e.code}: ${e.message}`)
      process.exit(1)
    }

    const template = result.files.find((f) => f.type === 'markedTemplate')
    if (!template) {
      console.error(`No markedTemplate produced for ${example.file} × ${target.id}`)
      process.exit(1)
    }

    const file = target.id === 'hono' ? example.file : `${baseName}${target.extension}`
    outputs.push({
      id: target.id,
      label: target.label,
      file,
      lang: target.lang,
      code: template.content.trimEnd(),
    })
  }

  examples.push({
    id: example.id,
    file: example.file,
    source: example.source.trimEnd(),
    outputs,
  })
}

const banner = `/**
 * AUTO-GENERATED — Do not edit manually.
 *
 * Real \`compileJSX\` output for the landing-page demo, generated by
 * landing/generate-demo-outputs.ts. Regenerate with:
 *
 *   bun run landing/generate-demo-outputs.ts   (from site/core)
 *
 * The LP's honesty guarantee: these panels are the compiler's actual
 * output for each example source, not hand-written approximations.
 */
`

const module_ = `${banner}
export interface DemoOutput {
  id: string
  label: string
  file: string
  lang: string
  code: string
}

export interface DemoExample {
  id: string
  file: string
  source: string
  outputs: DemoOutput[]
}

export const DEMO_EXAMPLES: DemoExample[] = ${JSON.stringify(examples, null, 2)}
`

await Bun.write(OUT_FILE, module_)
console.log(`Wrote ${OUT_FILE}`)
for (const ex of examples) {
  console.log(`\n=== ${ex.file} ===`)
  for (const o of ex.outputs) {
    console.log(`--- ${o.id} (${o.code.split('\n').length} lines) ---`)
  }
}
