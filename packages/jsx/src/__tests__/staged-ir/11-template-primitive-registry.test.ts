/**
 * Pins the wiring added in #1187 phase 2: `RelocateEnv.templatePrimitives`
 * and `acceptsTemplateCall` let the inline-safety checks in
 * `isInlinableInTemplate` bypass the bridged-arg / zero-arg shape
 * rejections for callees the adapter promises it can render in template
 * scope.
 *
 * No adapter populates the registry yet — the wiring is exercised here
 * via hand-built env objects. Phase 3 will fill the Hono predicate.
 */

import { describe, test, expect } from 'bun:test'
import type { RelocateEnv } from '../../relocate'
import { isInlinableInTemplate } from '../../relocate'
import type { BindingKind } from '../../types'

function envWith(
  bindings: Array<[string, BindingKind]>,
  options?: Partial<RelocateEnv>,
): RelocateEnv {
  return {
    bindings: new Map(bindings),
    inlinable: options?.inlinable ?? new Map(),
    propsForLift: new Set(
      bindings.filter(([, k]) => k === 'prop').map(([n]) => n),
    ),
    propsObjectName: options?.propsObjectName ?? 'props',
    allowFallback: options?.allowFallback ?? true,
    templatePrimitives: options?.templatePrimitives,
    acceptsTemplateCall: options?.acceptsTemplateCall,
  }
}

describe('isInlinableInTemplate — adapter-aware acceptance (#1187 phase 2)', () => {
  describe('zero-arg calls', () => {
    test('without a registry, a bare zero-arg call is rejected (baseline)', () => {
      const env = envWith([['readItems', 'module-import']])
      const r = isInlinableInTemplate('readItems()', env)
      expect(r.ok).toBe(false)
    })

    test('a callee in templatePrimitives bypasses the zero-arg rejection', () => {
      const env = envWith([['readItems', 'module-import']], {
        templatePrimitives: {
          readItems: () => 'readItems()',
        },
      })
      const r = isInlinableInTemplate('readItems()', env)
      expect(r.ok).toBe(true)
    })

    test('acceptsTemplateCall returning true bypasses the zero-arg rejection', () => {
      const env = envWith([['readItems', 'module-import']], {
        acceptsTemplateCall: (name) => name === 'readItems',
      })
      const r = isInlinableInTemplate('readItems()', env)
      expect(r.ok).toBe(true)
    })

    test('acceptsTemplateCall returning false leaves the zero-arg rejection intact', () => {
      const env = envWith([['readItems', 'module-import']], {
        acceptsTemplateCall: () => false,
      })
      const r = isInlinableInTemplate('readItems()', env)
      expect(r.ok).toBe(false)
    })
  })

  describe('bridged-arg calls (call with prop-derived argument)', () => {
    test('without a registry, a call with a bridged arg is rejected (baseline)', () => {
      const env = envWith(
        [
          ['stringify', 'module-import'],
          ['name', 'prop'],
        ],
        { propsObjectName: null },
      )
      const r = isInlinableInTemplate('stringify(name)', env)
      expect(r.ok).toBe(false)
    })

    test('a registered callee with a bridged arg is accepted', () => {
      const env = envWith(
        [
          ['stringify', 'module-import'],
          ['name', 'prop'],
        ],
        {
          propsObjectName: null,
          templatePrimitives: {
            stringify: (args) => `stringify(${args.join(', ')})`,
          },
        },
      )
      const r = isInlinableInTemplate('stringify(name)', env)
      expect(r.ok).toBe(true)
    })

    test('property-access callees resolve by full path (`JSON.stringify`)', () => {
      const env = envWith([['name', 'prop']], {
        propsObjectName: null,
        templatePrimitives: {
          'JSON.stringify': (args) => `JSON.stringify(${args[0]})`,
        },
      })
      const r = isInlinableInTemplate('JSON.stringify(name)', env)
      expect(r.ok).toBe(true)
    })
  })

  describe('nested calls', () => {
    test('outer call accepted, inner zero-arg call unregistered → still rejected', () => {
      const env = envWith([['readItems', 'module-import']], {
        templatePrimitives: {
          'JSON.stringify': (args) => `JSON.stringify(${args[0]})`,
        },
      })
      const r = isInlinableInTemplate('JSON.stringify(readItems())', env)
      expect(r.ok).toBe(false)
    })

    test('outer and inner both accepted → ok', () => {
      const env = envWith([['readItems', 'module-import']], {
        templatePrimitives: {
          'JSON.stringify': (args) => `JSON.stringify(${args[0]})`,
          readItems: () => 'readItems()',
        },
      })
      const r = isInlinableInTemplate('JSON.stringify(readItems())', env)
      expect(r.ok).toBe(true)
    })
  })

  describe('predicate vs explicit registry interaction', () => {
    test('explicit entry takes priority over predicate', () => {
      // Predicate would reject, but explicit entry accepts.
      const env = envWith([['JSON', 'global']], {
        templatePrimitives: {
          'JSON.stringify': (args) => `JSON.stringify(${args[0]})`,
        },
        acceptsTemplateCall: () => false,
      })
      const r = isInlinableInTemplate('JSON.stringify(1)', env)
      expect(r.ok).toBe(true)
    })

    test('predicate is consulted only when entry is absent', () => {
      const env = envWith([['Math', 'global']], {
        // No explicit Math.floor entry.
        acceptsTemplateCall: (name) => name === 'Math.floor',
      })
      const r = isInlinableInTemplate('Math.floor(1)', env)
      expect(r.ok).toBe(true)
    })
  })

  describe('shadow guard — local bindings must not activate the registry', () => {
    test('local const shadowing a global registry entry is rejected', () => {
      // User has `const JSON = ...` in init scope (or similar local
      // binding). `JSON.stringify` here is the local's `.stringify`
      // member, NOT the global. Registry must not fire.
      const env = envWith(
        [
          ['JSON', 'init-local'], // shadows the global
          ['name', 'prop'],
        ],
        {
          propsObjectName: null,
          templatePrimitives: {
            'JSON.stringify': (args) => `JSON.stringify(${args[0]})`,
          },
        },
      )
      const r = isInlinableInTemplate('JSON.stringify(name)', env)
      expect(r.ok).toBe(false) // bridged-arg fires because shadow guard kept the rejection in play
    })

    test('module-import binding: registry still applies', () => {
      // Module imports are stable enough to register against.
      const env = envWith(
        [
          ['JSON', 'module-import'],
          ['name', 'prop'],
        ],
        {
          propsObjectName: null,
          templatePrimitives: {
            'JSON.stringify': (args) => `JSON.stringify(${args[0]})`,
          },
        },
      )
      const r = isInlinableInTemplate('JSON.stringify(name)', env)
      expect(r.ok).toBe(true)
    })

    test('module-local binding: registry still applies', () => {
      // A pure helper defined at module scope (not imported) is still a
      // valid registration target — outside component-instance scope.
      const env = envWith(
        [
          ['format', 'module-local'],
          ['name', 'prop'],
        ],
        {
          propsObjectName: null,
          templatePrimitives: {
            format: (args) => `format(${args[0]})`,
          },
        },
      )
      const r = isInlinableInTemplate('format(name)', env)
      expect(r.ok).toBe(true)
    })

    test('signal-getter shadowing: registry must not fire', () => {
      // Even more obvious shadow case — `count` is a signal getter, the
      // registry has `count` as a registered primitive. Local wins.
      const env = envWith([['count', 'signal-getter']], {
        templatePrimitives: {
          count: () => 'count()',
        },
      })
      const r = isInlinableInTemplate('count()', env)
      expect(r.ok).toBe(false) // zero-arg rejection still fires
    })
  })

  describe('out-of-scope per #1187 R1: method calls on values', () => {
    test('method call on a prop value is not registry-resolvable', () => {
      // `name.toUpperCase()` — receiver type isn't part of the textual
      // callee path. Registry can only key on identifier paths, not on
      // type-anchored prototype methods (`String.prototype.toUpperCase`).
      // Pin so this limitation doesn't accidentally regress: the user
      // should fall back to `/* @client */`.
      const env = envWith([['name', 'prop']], {
        propsObjectName: null,
        templatePrimitives: {
          // A speculative future encoding the compiler doesn't understand:
          'String.prototype.toUpperCase': () => 'whatever',
        },
      })
      const r = isInlinableInTemplate('name.toUpperCase()', env)
      expect(r.ok).toBe(false) // bridged-arg fires (name is a prop)
    })

    test('non-identifier callee shape (`(getX())()`) returns null path → no registry hit', () => {
      // Even if a `getX` entry existed, the dynamic-dispatch shape
      // `(getX())()` doesn't expose a stable identifier path.
      const env = envWith([['getX', 'module-import']], {
        templatePrimitives: {
          getX: () => 'getX()',
        },
      })
      const r = isInlinableInTemplate('(getX())()', env)
      expect(r.ok).toBe(false) // outer call has no identifier path → unaccepted, zero-arg fires
    })
  })
})
