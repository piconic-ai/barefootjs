/**
 * combineParentChildClientJs - Unit Tests
 */

import { describe, test, expect } from 'bun:test'
import { combineParentChildClientJs } from '../combine-client-js'

describe('combineParentChildClientJs', () => {
  test('resolves single-component file by file name', () => {
    const files = new Map([
      ['CopyButton', [
        "import { hydrate, renderChild } from '@barefootjs/client/runtime'",
        "import '/* @bf-child:Icon */'",
        "hydrate('CopyButton', (el) => {})",
      ].join('\n')],
      ['Icon', [
        "import { hydrate } from '@barefootjs/client/runtime'",
        "hydrate('Icon', (el) => {})",
      ].join('\n')],
    ])

    const result = combineParentChildClientJs(files)

    expect(result.has('CopyButton')).toBe(true)
    const combined = result.get('CopyButton')!
    expect(combined).toContain("hydrate('Icon',")
    expect(combined).toContain("hydrate('CopyButton',")
    expect(combined).not.toContain('@bf-child:')
  })

  test('resolves multi-component file by component name from hydrate() calls', () => {
    // icon/index.tsx exports CopyIcon + CheckIcon, keyed as "icon" in the manifest
    const files = new Map([
      ['CopyButton', [
        "import { hydrate, renderChild } from '@barefootjs/client/runtime'",
        "import '/* @bf-child:CopyIcon */'",
        "hydrate('CopyButton', (el) => {})",
      ].join('\n')],
      ['icon', [
        "import { hydrate } from '@barefootjs/client/runtime'",
        "export function initCopyIcon(__scope) {}",
        "hydrate('CopyIcon', (el) => {})",
        "export function initCheckIcon(__scope) {}",
        "hydrate('CheckIcon', (el) => {})",
      ].join('\n')],
    ])

    const result = combineParentChildClientJs(files)

    expect(result.has('CopyButton')).toBe(true)
    const combined = result.get('CopyButton')!
    // Inlines the entire icon file (both CopyIcon and CheckIcon)
    expect(combined).toContain("hydrate('CopyIcon',")
    expect(combined).toContain("hydrate('CheckIcon',")
    expect(combined).toContain("hydrate('CopyButton',")
    expect(combined).not.toContain('@bf-child:')
  })

  test('does not duplicate when multiple children resolve to the same file', () => {
    // CopyButton uses both CopyIcon and CheckIcon, both from "icon" file.
    // The icon file must be inlined only ONCE to prevent duplicate declarations.
    const files = new Map([
      ['CopyButton', [
        "import { hydrate, renderChild } from '@barefootjs/client/runtime'",
        "import '/* @bf-child:CopyIcon */'",
        "import '/* @bf-child:CheckIcon */'",
        "hydrate('CopyButton', (el) => {})",
      ].join('\n')],
      ['icon', [
        "import { hydrate } from '@barefootjs/client/runtime'",
        "export function initCopyIcon(__scope) {}",
        "hydrate('CopyIcon', { init: initCopyIcon })",
        "export function initCheckIcon(__scope) {}",
        "hydrate('CheckIcon', { init: initCheckIcon })",
      ].join('\n')],
    ])

    const result = combineParentChildClientJs(files)

    const combined = result.get('CopyButton')!
    // Icon file content appears exactly once
    const copyIconCount = combined.split('initCopyIcon').length - 1
    const checkIconCount = combined.split('initCheckIcon').length - 1
    // initCopyIcon appears in: function declaration + hydrate call = 2
    expect(copyIconCount).toBe(2)
    // initCheckIcon appears in: function declaration + hydrate call = 2
    expect(checkIconCount).toBe(2)
  })

  test('gracefully handles missing child', () => {
    const files = new Map([
      ['Parent', [
        "import { hydrate } from '@barefootjs/client/runtime'",
        "import '/* @bf-child:NonExistent */'",
        "hydrate('Parent', (el) => {})",
      ].join('\n')],
    ])

    const result = combineParentChildClientJs(files)

    expect(result.has('Parent')).toBe(true)
    const combined = result.get('Parent')!
    // Parent code still emitted, missing child silently skipped
    expect(combined).toContain("hydrate('Parent',")
    expect(combined).not.toContain('@bf-child:')
  })

  test('resolves grandchild through multi-component file', () => {
    const files = new Map([
      ['Page', [
        "import { hydrate, renderChild } from '@barefootjs/client/runtime'",
        "import '/* @bf-child:CopyButton */'",
        "hydrate('Page', (el) => {})",
      ].join('\n')],
      ['CopyButton', [
        "import { hydrate, renderChild } from '@barefootjs/client/runtime'",
        "import '/* @bf-child:CopyIcon */'",
        "hydrate('CopyButton', (el) => {})",
      ].join('\n')],
      ['icon', [
        "import { hydrate } from '@barefootjs/client/runtime'",
        "hydrate('CopyIcon', (el) => {})",
        "hydrate('CheckIcon', (el) => {})",
      ].join('\n')],
    ])

    const result = combineParentChildClientJs(files)

    expect(result.has('Page')).toBe(true)
    const combined = result.get('Page')!
    // Grandchild (icon file) resolved through CopyButton → CopyIcon
    expect(combined).toContain("hydrate('CopyIcon',")
    expect(combined).toContain("hydrate('CopyButton',")
    expect(combined).toContain("hydrate('Page',")
  })

  test('file name lookup takes precedence over component name', () => {
    // If a file is named "CopyIcon" AND another file contains hydrate('CopyIcon'),
    // the file-name match should win
    const files = new Map([
      ['Parent', [
        "import { hydrate } from '@barefootjs/client/runtime'",
        "import '/* @bf-child:CopyIcon */'",
        "hydrate('Parent', (el) => {})",
      ].join('\n')],
      ['CopyIcon', [
        "import { hydrate } from '@barefootjs/client/runtime'",
        "hydrate('CopyIcon', (el) => { /* file-name match */ })",
      ].join('\n')],
      ['icon', [
        "import { hydrate } from '@barefootjs/client/runtime'",
        "hydrate('CopyIcon', (el) => { /* component-name match */ })",
        "hydrate('CheckIcon', (el) => {})",
      ].join('\n')],
    ])

    const result = combineParentChildClientJs(files)

    const combined = result.get('Parent')!
    // Should use the file-name match (CopyIcon file), not the component-name match (icon file)
    expect(combined).toContain('file-name match')
    expect(combined).not.toContain('component-name match')
  })

  test('resolves children when manifest keys are path-qualified (different files, same basename)', () => {
    // Two files with the same basename in different directories must not
    // collide when they both carry child placeholders. With path-qualified
    // manifest keys, the combiner's component-name → file-key fallback must
    // still resolve each child to the correct file.
    //
    // Repro: `site/ui/components/settings-demo.tsx` and
    //        `site/ui/components/gallery/admin/settings-demo.tsx`
    const files = new Map([
      ['settings-demo', [
        "import { hydrate } from '@barefootjs/client/runtime'",
        "import '/* @bf-child:Tabs */'",
        "hydrate('SettingsDemo', (el) => { /* top-level settings */ })",
      ].join('\n')],
      ['gallery/admin/settings-demo', [
        "import { hydrate } from '@barefootjs/client/runtime'",
        "import '/* @bf-child:Tabs */'",
        "hydrate('AdminSettingsDemo', (el) => { /* admin settings */ })",
      ].join('\n')],
      ['tabs', [
        "import { hydrate } from '@barefootjs/client/runtime'",
        "hydrate('Tabs', (el) => {})",
      ].join('\n')],
    ])

    const result = combineParentChildClientJs(files)

    // Both parents must combine correctly — neither should lose its Tabs inlining
    expect(result.has('settings-demo')).toBe(true)
    expect(result.has('gallery/admin/settings-demo')).toBe(true)

    const topCombined = result.get('settings-demo')!
    expect(topCombined).toContain("hydrate('SettingsDemo',")
    expect(topCombined).toContain("hydrate('Tabs',")
    expect(topCombined).not.toContain('@bf-child:')

    const adminCombined = result.get('gallery/admin/settings-demo')!
    expect(adminCombined).toContain("hydrate('AdminSettingsDemo',")
    expect(adminCombined).toContain("hydrate('Tabs',")
    expect(adminCombined).not.toContain('@bf-child:')
  })

  test('deduplicates imports from shared sources', () => {
    const files = new Map([
      ['Parent', [
        "import { hydrate, renderChild } from '@barefootjs/client/runtime'",
        "import '/* @bf-child:Child */'",
        "hydrate('Parent', (el) => {})",
      ].join('\n')],
      ['Child', [
        "import { hydrate, insert } from '@barefootjs/client/runtime'",
        "hydrate('Child', (el) => {})",
      ].join('\n')],
    ])

    const result = combineParentChildClientJs(files)

    const combined = result.get('Parent')!
    // All imports from @barefootjs/client/runtime merged into one line
    const importLines = combined.split('\n').filter(l => l.startsWith('import '))
    expect(importLines).toHaveLength(1)
    expect(importLines[0]).toContain('hydrate')
    expect(importLines[0]).toContain('insert')
    expect(importLines[0]).toContain('renderChild')
  })
})
