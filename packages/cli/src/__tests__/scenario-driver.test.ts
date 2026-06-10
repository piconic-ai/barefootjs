/**
 * Scenario driver (#1690, SR2/SR7) — the dynamic half of `bf debug profile`.
 *
 * Mounts a component's instrumented build in happy-dom, fires its interactive
 * elements, and records the reactive event stream. This exercises the real
 * runtime end-to-end (the unit tests in @barefootjs/jsx feed synthetic streams).
 */

import { describe, test, expect } from 'bun:test'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runAutoScenario, runFileScenario } from '../lib/scenario-driver'

const COUNTER = `
  'use client'
  import { createSignal, createMemo } from '@barefootjs/client'
  export function Counter() {
    const [count, setCount] = createSignal(0)
    const doubled = createMemo(() => count() * 2)
    return <button onClick={() => setCount(count() + 1)}>{doubled()}</button>
  }
`

describe('runAutoScenario', () => {
  test('mounts, fires the handler, and records a turn-stamped stream', async () => {
    const r = await runAutoScenario(COUNTER, 'Counter.tsx', 'Counter')
    expect(r.rootTag).toBe('button')
    expect(r.fired).toBeGreaterThanOrEqual(1)
    expect(r.events.length).toBeGreaterThan(0)

    // The auto-click drove the compiled handler's beginTurn/endTurn wrapper.
    const turn = r.events.find(e => e.type === 'turnBegin')
    expect(turn?.handlerId).toMatch(/^Counter#handler:s\d+:click$/)

    // The set landed inside that turn, and the memo re-ran with its real id.
    const set = r.events.find(e => e.type === 'signalSet' && e.signal === 'Counter#signal:count')
    expect(set?.turn).toBe(turn!.handlerId)
    expect(r.events.some(e => e.type === 'effectEnter' && e.subscriber === 'Counter#memo:doubled')).toBe(true)
  })

  test('fires list-item (delegated) handlers, not just buttons (#1796)', async () => {
    const LIST = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function List() {
        const [items, setItems] = createSignal([{ id: 1 }, { id: 2 }])
        return (
          <ul>
            {items().map(it => (
              <li key={it.id} onClick={() => setItems(items().filter(x => x.id !== it.id))}>row</li>
            ))}
          </ul>
        )
      }
    `
    const r = await runAutoScenario(LIST, 'List.tsx', 'List')
    // The delegated li handler fired (a turn opened) even though there's no button.
    const turn = r.events.find(e => e.type === 'turnBegin')
    expect(turn?.handlerId).toMatch(/^List#handler:s\d+:click$/)
    expect(r.fired).toBeGreaterThanOrEqual(2) // one per rendered row
  })

  test('reaches a separately-imported child component handler (#1796)', async () => {
    // The compound case: the target file has no handler of its own; the toggle
    // lives in a child component imported from a sibling file. Auto mode must
    // load the import graph (like a story) so the child registers, the mount
    // wires it, and its handler fires — instead of silently reading 0/0.
    const dir = mkdtempSync(join(tmpdir(), 'bf-compound-'))
    try {
      writeFileSync(join(dir, 'trigger.tsx'), `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function Trigger() {
          const [n, setN] = createSignal(0)
          return <button onClick={() => setN(n() + 1)}>{n()}</button>
        }
      `)
      const panelPath = join(dir, 'panel.tsx')
      const panelSrc = `
        'use client'
        import { Trigger } from './trigger'
        export function Panel() { return <div><Trigger /></div> }
      `
      writeFileSync(panelPath, panelSrc)

      const r = await runAutoScenario(panelSrc, panelPath, 'Panel')
      // The child source was pulled in (dependency first, target last).
      expect(r.sources.map(s => s.filePath.split('/').pop())).toEqual(['trigger.tsx', 'panel.tsx'])
      // The child's handler fired and opened a real turn — not 0/0.
      expect(r.fired).toBeGreaterThanOrEqual(1)
      const turn = r.events.find(e => e.type === 'turnBegin')
      expect(turn?.handlerId).toMatch(/^Trigger#handler:s\d+:click$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('profiles a component that imports a sibling plain helper module (#1873)', async () => {
    // A plain .ts helper emits no clientJs, so its compiled chunk is discarded
    // — but the `import { shout } from './repro-helper'` line survives in the
    // component's chunk and used to resolve (and fail) against the temp dir.
    const dir = mkdtempSync(join(tmpdir(), 'bf-helper-'))
    try {
      writeFileSync(join(dir, 'repro-helper.ts'), `
        export function shout(s: string): string { return s.toUpperCase() }
      `)
      const compPath = join(dir, 'ProfileRepro.tsx')
      const compSrc = `
        'use client'
        import { createSignal } from '@barefootjs/client'
        import { shout } from './repro-helper'
        export function ProfileRepro() {
          const [code, setCode] = createSignal('hi')
          return (
            <div>
              <span>{shout(code())}</span>
              <button onClick={() => setCode('bye')}>change</button>
            </div>
          )
        }
      `
      writeFileSync(compPath, compSrc)

      const r = await runAutoScenario(compSrc, compPath, 'ProfileRepro')
      expect(r.rootTag).toBe('div')
      expect(r.fired).toBeGreaterThanOrEqual(1)
      const turn = r.events.find(e => e.type === 'turnBegin')
      expect(turn?.handlerId).toMatch(/^ProfileRepro#handler:s\d+:click$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('profiles a component whose helper lives above the component dir (#1873)', async () => {
    // `../src/lib/helper`-style imports resolved against $TMPDIR before the
    // rewrite; the helper itself has a transitive relative import to cover
    // resolution from the helper's own directory.
    const dir = mkdtempSync(join(tmpdir(), 'bf-helper-up-'))
    try {
      const libDir = join(dir, 'src', 'lib')
      const compDir = join(dir, 'components')
      const { mkdirSync } = await import('fs')
      mkdirSync(libDir, { recursive: true })
      mkdirSync(compDir, { recursive: true })
      writeFileSync(join(libDir, 'words.ts'), `
        export const WORD = 'tick'
      `)
      writeFileSync(join(libDir, 'helper.ts'), `
        import { WORD } from './words'
        export function label(n: number): string { return WORD + ':' + n }
      `)
      const compPath = join(compDir, 'Timeline.tsx')
      const compSrc = `
        'use client'
        import { createSignal } from '@barefootjs/client'
        import { label } from '../src/lib/helper'
        export function Timeline() {
          const [n, setN] = createSignal(0)
          return <button onClick={() => setN(n() + 1)}>{label(n())}</button>
        }
      `
      writeFileSync(compPath, compSrc)

      const r = await runAutoScenario(compSrc, compPath, 'Timeline')
      const turn = r.events.find(e => e.type === 'turnBegin')
      expect(turn?.handlerId).toMatch(/^Timeline#handler:s\d+:click$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an unresolvable local import yields an actionable error, not a raw module stack (#1873)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-helper-missing-'))
    try {
      const compPath = join(dir, 'Broken.tsx')
      const compSrc = `
        'use client'
        import { createSignal } from '@barefootjs/client'
        import { gone } from './does-not-exist'
        export function Broken() {
          const [n, setN] = createSignal(0)
          return <button onClick={() => setN(n() + 1)}>{gone(n())}</button>
        }
      `
      writeFileSync(compPath, compSrc)
      await expect(runAutoScenario(compSrc, compPath, 'Broken')).rejects.toThrow(
        /does not resolve to a local file|static budget/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an import-shaped line inside a template literal is not treated as an import (#1873)', async () => {
    // A code-sample component embeds `import … from './…'` text in a template
    // literal. The emitted client JS carries that literal verbatim, with the
    // line at column 0 — a line-anchored regex would resolve it as a real
    // import (and fail); the top-level AST walk must ignore it.
    const dir = mkdtempSync(join(tmpdir(), 'bf-snippet-'))
    try {
      const compPath = join(dir, 'CodeSample.tsx')
      const compSrc = `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function CodeSample() {
          const [n, setN] = createSignal(0)
          const snippet = \`
import { x } from './not-on-disk'
\`
          return <button onClick={() => setN(n() + 1)}>{snippet + n()}</button>
        }
      `
      writeFileSync(compPath, compSrc)

      const r = await runAutoScenario(compSrc, compPath, 'CodeSample')
      const turn = r.events.find(e => e.type === 'turnBegin')
      expect(turn?.handlerId).toMatch(/^CodeSample#handler:s\d+:click$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a component with no handler records no interaction turns', async () => {
    const DISPLAY = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Display() { const [n] = createSignal(5); return <div>{n()}</div> }
    `
    const r = await runAutoScenario(DISPLAY, 'Display.tsx', 'Display')
    expect(r.events.some(e => e.type === 'turnBegin')).toBe(false)
  })
})

describe('mount resilience', () => {
  test('a component that throws on mount yields an actionable error, not a raw crash', async () => {
    const BOOM = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      export function Boom() {
        const ctx = undefined
        createEffect(() => { return ctx.state })
        return <div>x</div>
      }
    `
    await expect(runAutoScenario(BOOM, 'Boom.tsx', 'Boom')).rejects.toThrow(/context provider or composition|--scenario/)
  })
})

describe('runFileScenario (composition, #1796)', () => {
  test('compiles a story + its local import, mounts the composition, fires it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-story-'))
    try {
      writeFileSync(join(dir, 'toggle.tsx'), `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function Toggle() {
          const [on, setOn] = createSignal(false)
          return <button onClick={() => setOn(!on())}>{on() ? 'on' : 'off'}</button>
        }
      `)
      writeFileSync(join(dir, 'story.tsx'), `
        import { Toggle } from './toggle'
        export function Story() { return <div><Toggle /></div> }
      `)

      const r = await runFileScenario(join(dir, 'story.tsx'))
      // Both files were loaded (dependency first, story last).
      expect(r.sources.map(s => s.filePath.split('/').pop())).toEqual(['toggle.tsx', 'story.tsx'])
      // The composed Toggle's handler fired through the Story wrapper.
      const turn = r.events.find(e => e.type === 'turnBegin')
      expect(turn?.handlerId).toMatch(/^Toggle#handler:s\d+:click$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a missing scenario file throws the specific "Cannot read" error', async () => {
    // `loadWithLocalImports` must return [] for an unresolvable entry so the
    // file path surfaces this error rather than the generic "No client JS".
    await expect(runFileScenario('/nope/does-not-exist.tsx')).rejects.toThrow(/Cannot read scenario file/)
  })

  test('a directory entry (→ index.tsx) resolves imports from the index file dir', async () => {
    // The entry spec is a directory; it maps to `<dir>/index.tsx`. Its relative
    // imports must resolve from the index file's directory, not the spec's.
    const dir = mkdtempSync(join(tmpdir(), 'bf-index-'))
    try {
      writeFileSync(join(dir, 'knob.tsx'), `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function Knob() {
          const [n, setN] = createSignal(0)
          return <button onClick={() => setN(n() + 1)}>{n()}</button>
        }
      `)
      writeFileSync(join(dir, 'index.tsx'), `
        import { Knob } from './knob'
        export function Root() { return <section><Knob /></section> }
      `)

      // Pass the directory as the scenario "file" — resolveLocalFile maps it to index.tsx.
      const r = await runFileScenario(dir)
      expect(r.sources.map(s => s.filePath.split('/').pop())).toEqual(['knob.tsx', 'index.tsx'])
      const turn = r.events.find(e => e.type === 'turnBegin')
      expect(turn?.handlerId).toMatch(/^Knob#handler:s\d+:click$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
