/**
 * Integration test for #3160: a `'use client'` child renders an incoming
 * prop directly as its own JSX text (`{props.placeholder ?? ''}`) — a
 * compiler-managed slot wrapped in `<!--bf:sN-->…<!--/-->` markers at SSR,
 * with the compiled client template claiming that same marker pair at
 * hydrate time. The SAME component ALSO writes that node imperatively from
 * a `ref`/mount effect driven by something other than the prop itself (a
 * `useContext` read for `ComboboxValue`/`SelectValue`; a plain signal here,
 * which reproduces the identical mechanism without the extra
 * `createContext`/`.Provider` machinery) — nested under a sibling
 * `'use client'` component that passes the prop as a plain string literal,
 * mirroring `<ComboboxTrigger><ComboboxValue placeholder="…" /></ComboboxTrigger>`.
 *
 * Before the fix, the mount effect wrote via `el.textContent = …`, which
 * replaces ALL of `el`'s children — including the slot markers — with a
 * single bare text node. Pre- and post-hydration DOM then differ
 * structurally even though the rendered text is identical, exactly what
 * the real-browser oracle's `[snap]`/`[three-point]` checks caught for the
 * `combobox`/`select` fixtures. This test compiles the real components via
 * the real compiler, renders the real SSR HTML via the Hono adapter, drops
 * it into the document, runs the generated `hydrate` walk (the same
 * `@barefootjs/client/runtime` module the real components use), and
 * asserts the marker structure survives both the initial hydrate AND a
 * later imperative update — the general shape `ui/lib/set-text-preserving-
 * markers.ts` (wired into `ComboboxValue`/`SelectValue`) fixes.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { renderHonoComponent } from '../../../adapter-hono/src/test-render'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
import { writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const adapter = new TestAdapter()
const runtimePath = join(__dirname, '../../src/runtime/index.ts')

const CHILD_LINES = [
  "'use client'",
  "import { createEffect, createSignal } from '@barefootjs/client'",
  '',
  '// Mirrors the fix in ui/lib/set-text-preserving-markers.ts: write only',
  "// the text node between any existing sibling comment markers, so a",
  '// mount-effect write never clobbers the slot markers SSR (and the',
  "// compiler's own hydration writer) left around this position.",
  'function setTextPreservingMarkers(el, text) {',
  '  let textNode = null',
  '  for (const child of Array.from(el.childNodes)) {',
  '    if (child.nodeType === 3) textNode = child',
  '  }',
  '  if (textNode) {',
  '    textNode.data = text',
  "  } else if (text !== '') {",
  '    let endMarker = null',
  '    for (const child of Array.from(el.childNodes)) {',
  "      if (child.nodeType === 8 && child.nodeValue === '/') endMarker = child",
  '    }',
  '    el.insertBefore(document.createTextNode(text), endMarker)',
  '  }',
  '}',
  '',
  '// Mirrors ComboboxValue/SelectValue: a mount effect that writes the',
  "// same node its own JSX text child renders, driven by something other",
  '// than `props.placeholder` (a signal here; a `useContext` read for the',
  '// real components) — its transitions must ALSO preserve the slot',
  '// markers, not just the initial hydrate write.',
  'export function TextSlotChild(props: { placeholder?: string }) {',
  "  const [selected, setSelected] = createSignal('')",
  '  const handleMount = (el: HTMLElement) => {',
  "    el.addEventListener('click', () => setSelected('SvelteKit'))",
  '    createEffect(() => {',
  '      const val = selected()',
  "      setTextPreservingMarkers(el, val ? val : (props.placeholder ?? ''))",
  '    })',
  '  }',
  "  return <span ref={handleMount}>{props.placeholder ?? ''}</span>",
  '}',
]
const CHILD = CHILD_LINES.join('\n')

const SIBLING_LINES = [
  "'use client'",
  'export function Sibling(props: { children?: any }) {',
  '  return <div role="group">{props.children}</div>',
  '}',
]
const SIBLING = SIBLING_LINES.join('\n')

function reproSource(): string {
  return [
    "'use client'",
    "import { Sibling } from './Sibling'",
    "import { TextSlotChild } from './TextSlotChild'",
    'export function Repro() {',
    '  return (',
    '    <div>',
    '      <Sibling>',
    '        <TextSlotChild placeholder="Select framework..." />',
    '      </Sibling>',
    '    </div>',
    '  )',
    '}',
  ].join('\n')
}

/** Compile a component's client JS with imports re-anchored to the live runtime. */
function clientJsFor(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compile errors in ${filename}:\n${errors.map(e => `${e.code}: ${e.message}`).join('\n')}`)
  }
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error(`No client JS for ${filename}`)
  return clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
}

async function setupHydration(): Promise<{ hydrate: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'bf-3160-'))
  const modules: Array<[string, string, string]> = [
    [SIBLING, 'Sibling.tsx', 'Sibling'],
    [CHILD, 'TextSlotChild.tsx', 'TextSlotChild'],
    [reproSource(), 'Repro.tsx', 'Repro'],
  ]
  for (const [source, filename, name] of modules) {
    const file = join(dir, `${name}.mjs`)
    writeFileSync(file, clientJsFor(source, filename))
    await import(file)
  }

  // Real SSR HTML (Hono adapter) — same markup a server would send.
  const ssrHtml = await renderHonoComponent({
    adapter: new HonoAdapter(),
    source: reproSource(),
    components: { './Sibling.tsx': SIBLING, './TextSlotChild.tsx': CHILD },
    props: { __instanceId: 'Repro_test' },
  })
  document.body.innerHTML = ssrHtml

  const { rehydrateAll, flushHydration } = await import(runtimePath)
  return {
    hydrate: () => {
      rehydrateAll()
      flushHydration()
    },
  }
}

describe('#3160 — a nested child text slot keeps its SSR marker pair through hydration', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('marker structure is unchanged by hydration', async () => {
    const { hydrate } = await setupHydration()
    const span = document.querySelector('span')!
    const before = span.innerHTML
    expect(before).toBe('<!--bf:s0-->Select framework...<!--/-->')

    hydrate()

    expect(span.innerHTML).toBe(before)
  })

  test('markers also survive a later imperative write from the mount effect', async () => {
    const { hydrate } = await setupHydration()
    hydrate()

    const span = document.querySelector('span')!
    span.dispatchEvent(new window.Event('click', { bubbles: true }))

    expect(span.textContent).toBe('SvelteKit')
    expect(span.innerHTML).toBe('<!--bf:s0-->SvelteKit<!--/-->')
  })
})
