/**
 * Regression tests for issue #1160 / PR #1162.
 *
 * `render(container, name, props)` previously called `template(props)` without
 * setting `_parentScopeId`. Any `renderChild('Child', props, undefined, 'sN')`
 * inside the parent template fell through to the random-ID fallback and stamped
 * the child scope as `~Child_${random}_sN` instead of `~${parentScopeId}_sN`.
 * The compiler-emitted `$c(__scope, 'sN')` lookup then returned `null`,
 * `initChild('Child', null, ...)` bailed, and the child subtree was silently
 * inert (no `onInit`, no `ref` callbacks, no event wiring).
 *
 * The fix generates the scope ID up front, calls `setParentScopeId(scopeId)`
 * around the template invocation, and reuses the same ID when stamping `bf-s`.
 *
 * These tests pin the structural shape rather than exact IDs (Math.random based).
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { render } from '../../src/runtime/render'
import { renderChild } from '../../src/runtime/component'
import { $c } from '../../src/runtime/query'
import type { ComponentDef } from '../../src/runtime/types'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('render() threads parent scope ID into renderChild (#1160)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test("child's bf-s uses the parent's scope ID prefix, not a random child fallback", () => {
    const parent: ComponentDef = {
      name: 'Issue1160Parent',
      init: () => {},
      template: () => `<div>${renderChild('Issue1160Child', {}, undefined, 's0')}</div>`,
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    render(container, parent, {})

    const parentEl = container.firstElementChild as HTMLElement
    const parentScope = parentEl.getAttribute('bf-s') ?? ''
    expect(parentScope.startsWith('Issue1160Parent_')).toBe(true)

    const childEl = parentEl.firstElementChild as HTMLElement
    const childScope = childEl.getAttribute('bf-s') ?? ''
    // Pre-fix shape was `~Issue1160Child_${random}_s0`; post-fix is `~${parentScope}_s0`.
    expect(childScope).toBe(`~${parentScope}_s0`)
    expect(childScope.startsWith('~Issue1160Child_')).toBe(false)
  })

  test('$c(parentScope, "sN") resolves the child element after render()', () => {
    const parent: ComponentDef = {
      name: 'Issue1160ParentLookup',
      init: () => {},
      template: () =>
        `<div>${renderChild('Issue1160ChildLookup', {}, undefined, 's3')}</div>`,
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    render(container, parent, {})

    const parentEl = container.firstElementChild as HTMLElement
    const [foundChild] = $c(parentEl, 's3')
    expect(foundChild).not.toBeNull()
    expect(foundChild).toBe(parentEl.firstElementChild)
  })

  test('_parentScopeId does not leak across render() calls (verified via second render in different slot)', () => {
    const parentA: ComponentDef = {
      name: 'Issue1160LeakParentA',
      init: () => {},
      template: () => `<div>${renderChild('Issue1160LeakChild', {}, undefined, 's0')}</div>`,
    }
    const parentB: ComponentDef = {
      name: 'Issue1160LeakParentB',
      init: () => {},
      template: () => `<div>${renderChild('Issue1160LeakChild', {}, undefined, 's7')}</div>`,
    }

    const containerA = document.createElement('div')
    const containerB = document.createElement('div')
    document.body.appendChild(containerA)
    document.body.appendChild(containerB)

    render(containerA, parentA, {})
    render(containerB, parentB, {})

    const parentAEl = containerA.firstElementChild as HTMLElement
    const parentBEl = containerB.firstElementChild as HTMLElement
    const parentAScope = parentAEl.getAttribute('bf-s') ?? ''
    const parentBScope = parentBEl.getAttribute('bf-s') ?? ''

    const childA = parentAEl.firstElementChild as HTMLElement
    const childB = parentBEl.firstElementChild as HTMLElement

    // If render() leaked _parentScopeId, parentB's renderChild would still see
    // parentA's ID and stamp `~${parentAScope}_s7` on B's child.
    expect(childA.getAttribute('bf-s')).toBe(`~${parentAScope}_s0`)
    expect(childB.getAttribute('bf-s')).toBe(`~${parentBScope}_s7`)
  })

  test('a throwing template still restores _parentScopeId via try/finally', () => {
    const throwing: ComponentDef = {
      name: 'Issue1160Thrower',
      init: () => {},
      template: () => {
        throw new Error('boom')
      },
    }
    const after: ComponentDef = {
      name: 'Issue1160After',
      init: () => {},
      template: () => `<div>${renderChild('Issue1160AfterChild', {}, undefined, 's0')}</div>`,
    }

    const containerA = document.createElement('div')
    const containerB = document.createElement('div')
    document.body.appendChild(containerA)
    document.body.appendChild(containerB)

    expect(() => render(containerA, throwing, {})).toThrow('boom')

    // If finally{} didn't clear _parentScopeId, the next render's renderChild
    // would inherit the thrower's ID and produce `~Issue1160Thrower_*_s0`.
    render(containerB, after, {})
    const parentEl = containerB.firstElementChild as HTMLElement
    const parentScope = parentEl.getAttribute('bf-s') ?? ''
    const childScope = parentEl.firstElementChild?.getAttribute('bf-s') ?? ''
    expect(childScope).toBe(`~${parentScope}_s0`)
    expect(childScope.startsWith('~Issue1160Thrower_')).toBe(false)
  })

  test("existing bf-s on the rendered element is respected (not overwritten)", () => {
    const def: ComponentDef = {
      name: 'Issue1160Preset',
      init: () => {},
      template: () => `<div bf-s="preset-id">x</div>`,
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    render(container, def, {})

    expect(container.firstElementChild?.getAttribute('bf-s')).toBe('preset-id')
  })
})
