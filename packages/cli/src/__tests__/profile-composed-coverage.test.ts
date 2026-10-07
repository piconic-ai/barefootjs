/**
 * Coverage and turn attribution of composed handlers, through the real
 * `bf debug profile --scenario auto` path: the scenario driver mounts the
 * instrumented build in happy-dom and `buildProfileReport` reads the stream,
 * exactly as `commands/debug-profile.ts` wires them.
 *
 * - A callback handed to a child through a rest spread (`<button {...props}>`)
 *   runs inside a turn of its own (#3376).
 * - A callback prop is not a coverage unit of its own: it runs inside the
 *   child's DOM handler turn, so a fully exercised chain reads 1/1 (#3377).
 */

import { describe, test, expect } from 'bun:test'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildProfileReport, evaluateProfileGates } from '@barefootjs/jsx'
import type { ProfilerEvent } from '@barefootjs/shared'
import { runAutoScenario } from '../lib/scenario-driver'

const UI = join(import.meta.dir, '../../../../ui/components/ui')

async function profile(files: Record<string, string>, entry: string, name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'bf-composed-'))
  try {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(join(dir, rel, '..'), { recursive: true })
      writeFileSync(join(dir, rel), content)
    }
    return await profileIn(dir, entry, name)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function profileIn(dir: string, entry: string, name: string) {
  const filePath = join(dir, entry)
  const source = readFileSync(filePath, 'utf-8')
  const { events, sources } = await runAutoScenario(source, filePath, name)
  const report = buildProfileReport({
    source,
    filePath,
    componentName: name,
    scenario: 'auto',
    events,
    extraSources: sources.slice(0, -1),
  })
  const root = document.body.lastElementChild!
  return { events, report, root }
}

/** The single turn, and the parent signal write it carried. */
function turnWithSet(events: ProfilerEvent[], signal: string) {
  const begins = events.filter(e => e.type === 'turnBegin')
  const set = events.find(e => e.type === 'signalSet' && e.signal === signal)
  return { begins: begins.map(e => e.handlerId), setTurn: set?.turn }
}

const probe = (name: string, child: string, body: string) => `
  'use client'
  import { createSignal } from '@barefootjs/client'
  ${child ? `import { ${child} } from './${child}'` : ''}
  export function ${name}() {
    const [count, setCount] = createSignal(0)
    return <div><p>{count()}</p>${body}</div>
  }
`

describe('native, explicit-forwarding and rest-forwarding controls', () => {
  test('native onClick: one turn carries the write, 1/1', async () => {
    const { events, report, root } = await profile({
      'Native.tsx': probe('Native', '', '<button onClick={() => setCount(n => n + 1)}>+</button>'),
    }, 'Native.tsx', 'Native')
    const t = turnWithSet(events, 'Native#signal:count')
    expect(t.begins).toEqual(['Native#handler:s2:click'])
    expect(t.setTurn).toBe(t.begins[0])
    expect(root.querySelector('p')!.textContent).toBe('1')
    expect(report.coverage).toMatchObject({ handlersFired: 1, handlersTotal: 1, ratio: 1 })
    expect(report.guidance).toBeUndefined()
  })

  test('explicit forwarding (`onClick={props.onClick}`): the callback runs in the child turn, 1/1 (#3377)', async () => {
    const { events, report, root } = await profile({
      'ForwardButton.tsx': `
        'use client'
        interface Props { onClick?: () => void }
        export function ForwardButton(props: Props) {
          return <button onClick={props.onClick}>+</button>
        }
      `,
      'Forward.tsx': probe('Forward', 'ForwardButton', '<ForwardButton onClick={() => setCount(n => n + 1)} />'),
    }, 'Forward.tsx', 'Forward')
    const t = turnWithSet(events, 'Forward#signal:count')
    expect(t.begins).toEqual(['ForwardButton#handler:s0:click'])
    expect(t.setTurn).toBe(t.begins[0])
    expect(root.querySelector('p')!.textContent).toBe('1')
    // The parent's callback prop is not a second, never-observable unit.
    expect(report.coverage).toMatchObject({ handlersFired: 1, handlersTotal: 1, ratio: 1 })
    expect(report.guidance).toBeUndefined()
  })

  test('rest forwarding (`<button {...props}>`): the callback runs in a turn of its own, 1/1 (#3376)', async () => {
    const { events, report, root } = await profile({
      'SpreadButton.tsx': `
        'use client'
        interface Props { onClick?: () => void }
        export function SpreadButton(props: Props) {
          return <button {...props}>+</button>
        }
      `,
      'Spread.tsx': probe('Spread', 'SpreadButton', '<SpreadButton onClick={() => setCount(n => n + 1)} />'),
    }, 'Spread.tsx', 'Spread')
    const t = turnWithSet(events, 'Spread#signal:count')
    expect(t.begins).toEqual(['SpreadButton#handler:s0:click'])
    expect(t.setTurn).toBe(t.begins[0])
    expect(events.filter(e => e.type === 'turnEnd')).toHaveLength(1)
    expect(root.querySelector('p')!.textContent).toBe('1')
    expect(report.turns).toBe(1)
    expect(report.coverage).toMatchObject({ handlersFired: 1, handlersTotal: 1, ratio: 1, unattributed: [] })
    expect(report.guidance).toBeUndefined()
  })
})

describe('controlled registry components (#3377)', () => {
  for (const [comp, extra] of [['switch', []], ['checkbox', ['icon']]] as const) {
    test(`a controlled ${comp} reads 1/1 and the parent state flips inside the child turn`, async () => {
      const dir = mkdtempSync(join(tmpdir(), `bf-${comp}-`))
      try {
        for (const d of [comp, ...extra]) {
          mkdirSync(join(dir, 'ui', d), { recursive: true })
          copyFileSync(join(UI, d, 'index.tsx'), join(dir, 'ui', d, 'index.tsx'))
        }
        const Name = comp === 'switch' ? 'Switch' : 'Checkbox'
        writeFileSync(join(dir, 'Probe.tsx'), `
          'use client'
          import { createSignal } from '@barefootjs/client'
          import { ${Name} } from './ui/${comp}'
          export function Probe() {
            const [enabled, setEnabled] = createSignal(false)
            return <div><p>{enabled() ? 'on' : 'off'}</p><${Name} checked={enabled()} onCheckedChange={setEnabled} /></div>
          }
        `)
        const { events, report, root } = await profileIn(dir, 'Probe.tsx', 'Probe')
        const t = turnWithSet(events, 'Probe#signal:enabled')
        expect(t.begins).toHaveLength(1)
        expect(t.begins[0]).toMatch(new RegExp(`^${Name}#handler:s\\d+:click$`))
        expect(t.setTurn).toBe(t.begins[0])
        expect(root.querySelector('p')!.textContent).toBe('on')
        expect(report.coverage).toMatchObject({ handlersFired: 1, handlersTotal: 1, ratio: 1 })
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})

describe('an unexercised independent handler still counts', () => {
  test('lowers coverage and fails an opted-in coverage gate', async () => {
    const { report } = await profile({
      'Partial.tsx': `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function Partial() {
          const [open, setOpen] = createSignal(false)
          const [count, setCount] = createSignal(0)
          return (
            <div>
              <button onClick={() => setCount(n => n + 1)}>{count()}</button>
              {open() ? <button onClick={() => setOpen(false)}>close</button> : null}
            </div>
          )
        }
      `,
    }, 'Partial.tsx', 'Partial')
    expect(report.coverage).toMatchObject({ handlersFired: 1, handlersTotal: 2, ratio: 0.5 })
    expect(report.guidance?.reason).toBe('partial-coverage')
    const gates = evaluateProfileGates(report, { minCoverage: 1 })
    expect(gates.passed).toBe(false)
    expect(gates.failed).toContain('coverage')
  })
})
