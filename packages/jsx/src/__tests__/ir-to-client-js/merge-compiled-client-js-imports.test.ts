/**
 * `mergeCompiledClientJsImports` merges sibling components' compiled
 * client-JS blobs (`compileMultipleComponents`'s two call sites) via a
 * real `ts.createSourceFile` AST walk — never a text/regex line scan — so
 * a string or template-literal VALUE that merely contains a line starting
 * with `import ` can never be torn out of its literal and hoisted into the
 * imports block. Mirrors `combine-client-js.test.ts`'s `#1702` regression
 * test for `parseAndMerge`, the established precedent this function
 * follows (see its own docstring).
 */
import { describe, test, expect } from 'bun:test'
import { mergeCompiledClientJsImports } from '../../ir-to-client-js/imports'

describe('mergeCompiledClientJsImports', () => {
  test('does not treat an import-shaped line inside a string/template literal as a real import (#1702-class)', () => {
    // A docs component embeds a code sample whose CONTENTS contain a
    // line that starts with `import `. A line-based scan would tear that
    // fake import out of the literal and hoist it into the imports
    // block, leaving `hydrate` undefined and corrupting the literal.
    const sample = [
      '`Example usage:',
      '',
      "import { createSignal } from '@barefootjs/client'",
      '',
      'export function Counter() {}`',
    ].join('\n')

    const componentA = [
      "import { hydrate, createSignal } from '@barefootjs/client/runtime'",
      `const SAMPLE = ${sample}`,
      "hydrate('DocsExample', (el) => {})",
    ].join('\n')

    const merged = mergeCompiledClientJsImports([componentA])

    // The real runtime import survives as its own top-level declaration,
    // exactly once — not duplicated by the fake import line inside the
    // string literal.
    const realImportOccurrences = (merged.match(/^import \{ hydrate, createSignal \} from '@barefootjs\/client\/runtime'$/gm) ?? []).length
    expect(realImportOccurrences).toBe(1)
    // The sample string is untouched — the fake import line inside it is
    // still there, still nested inside the backtick literal, not hoisted
    // out as a separate top-level statement.
    expect(merged).toContain('const SAMPLE = `Example usage:')
    expect(merged).toContain("import { createSignal } from '@barefootjs/client'\n\nexport function Counter() {}`")
  })

  // #2767 follow-up: the same duplicate-binding SyntaxError F1 pinned for
  // the old regex-based merge, now exercised through the AST-based path.
  test('folds a default import shared across sibling components instead of redeclaring the binding', () => {
    const componentA = [
      "import cfg from './config'",
      "hydrate('CompA', (el) => {})",
    ].join('\n')
    const componentB = [
      "import cfg, { helper } from './config'",
      "hydrate('CompB', (el) => {})",
    ].join('\n')

    const merged = mergeCompiledClientJsImports([componentA, componentB])

    expect(merged).toContain("import cfg, { helper } from './config'")
    // Exactly one declaration — not one per sibling component.
    expect((merged.match(/\bcfg\b/g) ?? []).length).toBe(1)
  })

  test('keeps an unresolved @bf-child: placeholder import (does not drop it, unlike parent-child inlining)', () => {
    const componentA = [
      "import { hydrate, initChild } from '@barefootjs/client/runtime'",
      "import '/* @bf-child:Child */'",
      "hydrate('Parent', (el) => { initChild('Child', el, {}) })",
    ].join('\n')

    const merged = mergeCompiledClientJsImports([componentA])

    expect(merged).toContain("import '/* @bf-child:Child */'")
  })

  test('dedupes an identical @bf-child: placeholder shared by two sibling components', () => {
    const componentA = [
      "import '/* @bf-child:Shared */'",
      "hydrate('A', (el) => {})",
    ].join('\n')
    const componentB = [
      "import '/* @bf-child:Shared */'",
      "hydrate('B', (el) => {})",
    ].join('\n')

    const merged = mergeCompiledClientJsImports([componentA, componentB])

    expect((merged.match(/@bf-child:Shared/g) ?? []).length).toBe(1)
  })

  test('preserves a namespace import on its own line, deduped by exact source+name across components', () => {
    const componentA = [
      "import * as util from './util'",
      "hydrate('A', (el) => {})",
    ].join('\n')
    const componentB = [
      "import * as util from './util'",
      "hydrate('B', (el) => {})",
    ].join('\n')

    const merged = mergeCompiledClientJsImports([componentA, componentB])

    expect((merged.match(/import \* as util from '\.\/util'/g) ?? []).length).toBe(1)
  })

  test('preserves both components\' code sections after import extraction', () => {
    const componentA = "import { hydrate } from '@barefootjs/client/runtime'\nhydrate('A', (el) => {})"
    const componentB = "import { hydrate } from '@barefootjs/client/runtime'\nhydrate('B', (el) => {})"

    const merged = mergeCompiledClientJsImports([componentA, componentB])

    expect(merged).toContain("hydrate('A', (el) => {})")
    expect(merged).toContain("hydrate('B', (el) => {})")
    expect((merged.match(/^import \{ hydrate \}/gm) ?? []).length).toBe(1)
  })
})
