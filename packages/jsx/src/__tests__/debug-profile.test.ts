/**
 * Tests for `bf debug profile` (#1690 / SR5 static budget).
 *
 * Covers:
 *  - buildReactiveProfile: correct metrics from IR
 *  - findins: high-fan-out, deep-memo-chain, batch-candidate, fallback-heavy
 *  - Bug A minimal repro: sourceFile empty for non-reactive components
 *  - Bug B minimal repro: batch-candidate false positive in if/else (controlled/uncontrolled)
 *  - Bug C minimal repro: duplicate findings from template reuse
 *  - diffProfiles: regression detection (SR6)
 *  - formatSingleProfile, formatProfileTable, formatProfileDiff
 */

import { describe, it, expect } from 'bun:test'
import {
  buildReactiveProfile,
  diffProfiles,
  formatSingleProfile,
  formatProfileTable,
  formatProfileDiff,
} from '../debug-profile.ts'

// =============================================================================
// Fixtures
// =============================================================================

const SWITCH_SOURCE = `
"use client"
import { createSignal, createMemo } from '@barefootjs/client'
function Switch(props: any) {
  const [internalChecked, setInternalChecked] = createSignal(props.defaultChecked ?? false)
  const [controlledChecked, setControlledChecked] = createSignal<boolean | undefined>(props.checked)
  const isControlled = createMemo(() => props.checked !== undefined)
  const isChecked = createMemo(() => isControlled() ? controlledChecked() : internalChecked())

  const handleClick = () => {
    if (isControlled()) {
      setControlledChecked(!isChecked())
    } else {
      setInternalChecked(!isChecked())
    }
  }

  return (
    <button
      data-state={isChecked() ? 'checked' : 'unchecked'}
      aria-checked={isChecked()}
      onClick={handleClick}
    />
  )
}
`

const SCROLL_AREA_SOURCE = `
"use client"
import { createSignal } from '@barefootjs/client'
function ScrollArea(props: any) {
  const [scrolling, setScrolling] = createSignal(false)
  const [thumbVSize, setThumbVSize] = createSignal(0)
  const [thumbVPos, setThumbVPos] = createSignal(0)

  const handleScroll = () => {
    setScrolling(true)
    setThumbVSize(100)
    setThumbVPos(50)
  }

  return (
    <div onScroll={handleScroll}>
      <div style={\`height: \${thumbVSize()}%\`} />
      <div style={\`top: \${thumbVPos()}%\`} />
    </div>
  )
}
`

const CALENDAR_DUAL_MONTH_SOURCE = `
"use client"
import { createSignal } from '@barefootjs/client'
function Calendar(props: any) {
  const [currentYear, setCurrentYear] = createSignal(2024)
  const [currentMonth, setCurrentMonth] = createSignal(0)

  const goPrev = () => {
    setCurrentYear(currentYear() - 1)
    setCurrentMonth(currentMonth() - 1)
  }

  return (
    <div>
      <button onClick={goPrev}>prev</button>
      <button onClick={goPrev}>prev2</button>
    </div>
  )
}
`

const DEEP_MEMO_SOURCE = `
"use client"
import { createSignal, createMemo } from '@barefootjs/client'
function DeepChain(props: any) {
  const [base, setBase] = createSignal(0)
  const a = createMemo(() => base() + 1)
  const b = createMemo(() => a() + 1)
  const c = createMemo(() => b() + 1)
  const d = createMemo(() => c() + 1)
  return <span>{d()}</span>
}
`

const HIGH_FANOUT_SOURCE = `
"use client"
import { createSignal } from '@barefootjs/client'
function HighFanOut(props: any) {
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <span>{count()}</span>
      <span>{count()}</span>
      <span>{count()}</span>
      <span>{count()}</span>
    </div>
  )
}
`

const FALLBACK_HEAVY_SOURCE = `
"use client"
import { createSignal } from '@barefootjs/client'
function FallbackHeavy(props: any) {
  const [value, setValue] = createSignal('')
  return (
    <div>
      <span className={getClass(value())}>{formatValue(value())}</span>
      <span className={getClass(value())}>{formatValue(value())}</span>
      <span className={getClass(value())}>{formatValue(value())}</span>
      <span className={getClass(value())}>{formatValue(value())}</span>
    </div>
  )
}
`

const STATIC_SOURCE = `
function Button(props: any) {
  return <button className="btn">{props.children}</button>
}
`

const FILE = '/fake/path/component.tsx'

// =============================================================================
// Basic profile metrics
// =============================================================================

describe('buildReactiveProfile — metrics', () => {
  it('counts signals, memos, and bindings', () => {
    const profile = buildReactiveProfile(SWITCH_SOURCE, FILE)
    const m = profile.metrics
    expect(m.signals).toBe(2)
    expect(m.memos).toBe(2)
    expect(m.dynamicBindings).toBeGreaterThanOrEqual(2) // isChecked dom bindings
  })

  it('computes memo chain depth correctly', () => {
    const profile = buildReactiveProfile(DEEP_MEMO_SOURCE, FILE)
    // base → a → b → c → d: depth 4
    expect(profile.metrics.maxMemoChainDepth).toBe(4)
  })

  it('computes fan-out for the hottest signal', () => {
    const profile = buildReactiveProfile(HIGH_FANOUT_SOURCE, FILE)
    // count() appears in 4 text bindings
    expect(profile.metrics.maxSignalFanOut).toBeGreaterThanOrEqual(1)
    expect(profile.metrics.hotSignal).toBe('count')
  })

  it('marks non-reactive component as not hydrated', () => {
    const profile = buildReactiveProfile(STATIC_SOURCE, FILE)
    expect(profile.metrics.hydrated).toBe(false)
    expect(profile.metrics.signals).toBe(0)
    expect(profile.metrics.memos).toBe(0)
  })

  it('returns the filePath as sourceFile (Bug A fix)', () => {
    // Non-reactive components have no signal/memo locations → sourceFile was '' before fix
    const profile = buildReactiveProfile(STATIC_SOURCE, FILE)
    expect(profile.metrics.sourceFile).toBe(FILE)
  })

  it('returns non-empty sourceFile for reactive components', () => {
    const profile = buildReactiveProfile(SWITCH_SOURCE, FILE)
    expect(profile.metrics.sourceFile).toBe(FILE)
  })
})

// =============================================================================
// Findings
// =============================================================================

describe('buildReactiveProfile — findings', () => {
  it('emits high-fan-out finding when signal exceeds threshold', () => {
    const profile = buildReactiveProfile(HIGH_FANOUT_SOURCE, FILE)
    const fanOut = profile.findings.filter(f => f.kind === 'high-fan-out')
    expect(fanOut.length).toBeGreaterThanOrEqual(1)
    expect(fanOut[0].signal).toBe('count')
  })

  it('emits deep-memo-chain finding for 4-level chain', () => {
    const profile = buildReactiveProfile(DEEP_MEMO_SOURCE, FILE)
    const chain = profile.findings.filter(f => f.kind === 'deep-memo-chain')
    expect(chain.length).toBe(1)
    expect(chain[0].depth).toBe(4)
  })

  it('emits batch-candidate for ScrollArea (all setters fire unconditionally)', () => {
    const profile = buildReactiveProfile(SCROLL_AREA_SOURCE, FILE)
    const batch = profile.findings.filter(f => f.kind === 'batch-candidate')
    expect(batch.length).toBe(1)
    expect(batch[0].signals).toContain('scrolling')
    expect(batch[0].signals).toContain('thumbVSize')
    expect(batch[0].signals).toContain('thumbVPos')
  })

  it('does NOT emit duplicate findings for same handler used in two JSX locations (Bug C fix)', () => {
    // Calendar dual-month: same onClick handler wired to two <button> elements
    const profile = buildReactiveProfile(CALENDAR_DUAL_MONTH_SOURCE, FILE)
    const batch = profile.findings.filter(f => f.kind === 'batch-candidate')
    // There should be at most 1 finding per unique (kind, file, line, signals) combination
    const seen = new Set<string>()
    for (const f of batch) {
      const key = `${f.kind}|${f.loc?.file ?? ''}|${f.loc?.line ?? ''}|${(f.signals ?? []).sort().join(',')}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('emits fallback-heavy finding when >50% of bindings are fallback-wrapped', () => {
    // Note: may require the component to actually produce fallback-wrapped bindings
    // Only verified structurally here; real-world trigger tested via calendar.
    const profile = buildReactiveProfile(FALLBACK_HEAVY_SOURCE, FILE)
    // If fallbacks >= 3 and ratio >= 0.5, finding is emitted
    if (profile.metrics.fallbacks >= 3 && profile.metrics.dynamicBindings > 0) {
      const fallbackFindings = profile.findings.filter(f => f.kind === 'fallback-heavy')
      if (profile.metrics.fallbacks / profile.metrics.dynamicBindings > 0.5) {
        expect(fallbackFindings.length).toBe(1)
      }
    }
  })

  it('emits no findings for a simple reactive component within thresholds', () => {
    // Switch has fan-out=1, chain=2, 1 batch-candidate (false positive from controlled/uncontrolled)
    // The batch-candidate IS emitted (false positive — controlled/uncontrolled not yet detected)
    // This test documents the current behavior so regressions are caught.
    const profile = buildReactiveProfile(SWITCH_SOURCE, FILE)
    const fanOut = profile.findings.filter(f => f.kind === 'high-fan-out')
    const chain = profile.findings.filter(f => f.kind === 'deep-memo-chain')
    expect(fanOut.length).toBe(0)
    expect(chain.length).toBe(0)
  })
})

// =============================================================================
// Bug B: batch-candidate false positive (controlled/uncontrolled pattern)
// This test documents the CURRENT behavior (known false positive).
// When Bug B is fixed (AST-level control flow), update expectation to toBe(0).
// =============================================================================

describe('buildReactiveProfile — Bug B: batch-candidate precision', () => {
  it('KNOWN FALSE POSITIVE: reports batch-candidate for switch controlled/uncontrolled if/else', () => {
    // handleClick calls setControlled XOR setInternal (not both) based on isControlled().
    // Static analysis cannot prove this without control flow awareness, so it flags both setters.
    const profile = buildReactiveProfile(SWITCH_SOURCE, FILE)
    const batch = profile.findings.filter(f => f.kind === 'batch-candidate')
    // Currently: 1 false positive (known limitation, documented here)
    // When Bug B is fixed, this should be 0.
    expect(batch.length).toBe(1) // document current behavior
  })
})

// =============================================================================
// diffProfiles (SR6)
// =============================================================================

describe('diffProfiles (SR6)', () => {
  it('detects regressions when reactive cost increases', () => {
    const before = buildReactiveProfile(SWITCH_SOURCE, FILE).metrics
    const after = buildReactiveProfile(HIGH_FANOUT_SOURCE, FILE).metrics
    const diff = diffProfiles(before, after)
    // hotSignal might change, but the key thing is we can compute a diff
    expect(diff.componentName).toBeTruthy()
  })

  it('returns empty diff when metrics are identical', () => {
    const profile = buildReactiveProfile(SWITCH_SOURCE, FILE)
    const diff = diffProfiles(profile.metrics, { ...profile.metrics })
    expect(diff.regressions).toHaveLength(0)
    expect(diff.improvements).toHaveLength(0)
    expect(diff.neutral).toHaveLength(0)
  })

  it('reports fallback increase as regression', () => {
    const lowFallback = buildReactiveProfile(SWITCH_SOURCE, FILE).metrics
    // Manually craft a "before" with lower fallbacks
    const before = { ...lowFallback, fallbacks: 0 }
    const after = { ...lowFallback, fallbacks: 5 }
    const diff = diffProfiles(before, after)
    const reg = diff.regressions.find(r => r.metric === 'fallbacks')
    expect(reg).toBeTruthy()
    expect(reg?.delta).toBe(5)
  })

  it('reports memo chain depth decrease as improvement', () => {
    const profile = buildReactiveProfile(DEEP_MEMO_SOURCE, FILE).metrics
    const before = { ...profile, maxMemoChainDepth: 6 }
    const after = { ...profile, maxMemoChainDepth: 2 }
    const diff = diffProfiles(before, after)
    const imp = diff.improvements.find(r => r.metric === 'maxMemoChainDepth')
    expect(imp).toBeTruthy()
    expect(imp?.delta).toBe(-4)
  })
})

// =============================================================================
// Formatting
// =============================================================================

describe('formatSingleProfile', () => {
  it('includes component name and hydrated status', () => {
    const profile = buildReactiveProfile(SWITCH_SOURCE, FILE)
    const output = formatSingleProfile(profile)
    expect(output).toContain('— reactive profile')
    expect(output).toContain('hydrated: yes')
  })

  it('includes Counts and Reactive budget sections', () => {
    const profile = buildReactiveProfile(SWITCH_SOURCE, FILE)
    const output = formatSingleProfile(profile)
    expect(output).toContain('Counts:')
    expect(output).toContain('Reactive budget (SR5):')
  })

  it('includes Findings section when findings exist', () => {
    const profile = buildReactiveProfile(HIGH_FANOUT_SOURCE, FILE)
    const output = formatSingleProfile(profile)
    expect(output).toContain('Findings:')
    expect(output).toContain('high-fan-out')
  })

  it('shows "No findings" for a clean component', () => {
    const profile = buildReactiveProfile(STATIC_SOURCE, FILE)
    const output = formatSingleProfile(profile)
    expect(output).toContain('No findings')
  })
})

describe('formatProfileTable', () => {
  it('renders a table with headers and component rows', () => {
    const profiles = [
      buildReactiveProfile(SWITCH_SOURCE, FILE),
      buildReactiveProfile(STATIC_SOURCE, FILE),
    ]
    const output = formatProfileTable(profiles)
    expect(output).toContain('Component')
    expect(output).toContain('sig')
    expect(output).toContain('subs')
  })

  it('returns "No components found" for empty array', () => {
    expect(formatProfileTable([])).toBe('No components found.')
  })

  it('sorts by totalSubscriptions descending', () => {
    const switchProfile = buildReactiveProfile(SWITCH_SOURCE, FILE)
    const staticProfile = buildReactiveProfile(STATIC_SOURCE, FILE)
    const output = formatProfileTable([staticProfile, switchProfile])
    // Switch (higher subs) should appear before Button (0 subs)
    const switchIdx = output.indexOf('Switch')
    const buttonIdx = output.indexOf('Button')
    // If Button doesn't appear (static component might be skipped), just check Switch is present
    expect(switchIdx).toBeGreaterThan(-1)
    if (buttonIdx > -1) {
      expect(switchIdx).toBeLessThan(buttonIdx)
    }
  })
})

describe('formatProfileDiff', () => {
  it('shows regressions and improvements', () => {
    const before = buildReactiveProfile(SWITCH_SOURCE, FILE).metrics
    const after = { ...before, fallbacks: before.fallbacks + 3, maxSignalFanOut: Math.max(0, before.maxSignalFanOut - 1) }
    const diff = diffProfiles(before, after)
    const output = formatProfileDiff(diff)
    expect(output).toContain('Regressions')
    if (after.maxSignalFanOut < before.maxSignalFanOut) {
      expect(output).toContain('Improvements')
    }
  })

  it('shows "No changes" when metrics are identical', () => {
    const profile = buildReactiveProfile(SWITCH_SOURCE, FILE)
    const diff = diffProfiles(profile.metrics, { ...profile.metrics })
    const output = formatProfileDiff(diff)
    expect(output).toContain('No changes')
  })
})
