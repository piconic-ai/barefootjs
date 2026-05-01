/**
 * Pins the **stage-violation diagnostic infrastructure**: BF060/BF061/
 * BF062 codes are registered, `recordStageDiagnostics` produces well-
 * formed warnings, and the messages reference the offending binding
 * by name.
 *
 * Default emission policy is OFF — silent fallback at template scope
 * is the documented design (#1128). The diagnostic factory exists so
 * an opt-in caller (a future `strictStageBoundaries` mode, IDE
 * tooling) can surface BF060/BF061 to users without breaking the
 * default contract.
 *
 * BF060: signal/memo getter referenced from template scope
 * BF061: init-scope local referenced from template scope
 * BF062: cross-stage await — emitted at Phase 1 dispatcher (not here)
 */

import { describe, test, expect } from 'bun:test'
import { ErrorCodes } from '../../errors'
import { recordStageDiagnostics } from '../../ir-to-client-js/compute-inlinability'
import type { ConstantInfo, CompilerError } from '../../types'
import type { RelocateDecision } from '../../relocate'

const dummyLoc = {
  file: 'Test.tsx',
  start: { line: 1, column: 0 },
  end: { line: 1, column: 1 },
}

const constInfo = (name: string): ConstantInfo => ({
  name,
  value: '',
  declarationKind: 'const',
  type: null,
  loc: dummyLoc,
})

describe('Stage-violation diagnostic codes (BF060/BF061/BF062)', () => {
  test('error codes are registered with non-empty messages', () => {
    expect(ErrorCodes.STAGE_REACTIVE_IN_TEMPLATE).toBe('BF060')
    expect(ErrorCodes.STAGE_INIT_LOCAL_IN_TEMPLATE).toBe('BF061')
    expect(ErrorCodes.STAGE_AWAIT_IN_TEMPLATE).toBe('BF062')
  })
})

describe('recordStageDiagnostics', () => {
  test('signal-getter decision → BF060 warning', () => {
    const warnings: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'count', kind: 'signal-getter', action: 'fallback', rewrittenAs: 'undefined' },
    ]
    recordStageDiagnostics(constInfo('cls'), decisions, warnings)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.code).toBe('BF060')
    expect(warnings[0]?.severity).toBe('warning')
    expect(warnings[0]?.message).toContain('count')
    expect(warnings[0]?.message).toContain('cls')
  })

  test('memo-getter decision → BF060 warning', () => {
    const warnings: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'doubled', kind: 'memo-getter', action: 'fallback', rewrittenAs: 'undefined' },
    ]
    recordStageDiagnostics(constInfo('view'), decisions, warnings)
    expect(warnings[0]?.code).toBe('BF060')
  })

  test('init-local decision → BF061 warning', () => {
    const warnings: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'cachedViewport', kind: 'init-local', action: 'fallback', rewrittenAs: 'undefined' },
    ]
    recordStageDiagnostics(constInfo('view'), decisions, warnings)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.code).toBe('BF061')
    expect(warnings[0]?.message).toContain('cachedViewport')
  })

  test('sub-init-local decision → BF061 warning', () => {
    const warnings: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'tmp', kind: 'sub-init-local', action: 'fallback', rewrittenAs: 'undefined' },
    ]
    recordStageDiagnostics(constInfo('val'), decisions, warnings)
    expect(warnings[0]?.code).toBe('BF061')
  })

  test('pass-through and lift decisions emit nothing', () => {
    const warnings: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'JSON', kind: 'global', action: 'pass-through', rewrittenAs: 'JSON' },
      { name: 'name', kind: 'prop', action: 'lift-to-prop', rewrittenAs: '_p.name' },
    ]
    recordStageDiagnostics(constInfo('cls'), decisions, warnings)
    expect(warnings).toHaveLength(0)
  })

  test('per-name de-dup: duplicate ref emits one warning, not many', () => {
    const warnings: CompilerError[] = []
    const decisions: RelocateDecision[] = [
      { name: 'flag', kind: 'init-local', action: 'fallback', rewrittenAs: 'undefined' },
      { name: 'flag', kind: 'init-local', action: 'fallback', rewrittenAs: 'undefined' },
    ]
    recordStageDiagnostics(constInfo('cls'), decisions, warnings)
    expect(warnings).toHaveLength(1)
  })
})
