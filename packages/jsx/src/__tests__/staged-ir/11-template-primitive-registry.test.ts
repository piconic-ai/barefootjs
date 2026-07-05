/**
 * Pins the wiring added in #1187 phase 2: `RelocateEnv.templatePrimitives`
 * and `acceptsTemplateCall` let the inline-safety checks in
 * `isInlinableInTemplate` bypass the bridged-arg / zero-arg shape
 * rejections for callees the adapter promises it can render in template
 * scope.
 *
 * #2069 extends this with two more acceptance mechanisms, tested in the
 * two `describe` blocks at the bottom of this file:
 *   - `RelocateEnv.loweringMatchers` — a THIRD acceptance path alongside
 *     `templatePrimitives` / `acceptsTemplateCall`, for calls a
 *     `LoweringPlugin` recognises structurally (never string-keyed).
 *   - `RelocateEnv.aliasTargets` — one-hop alias resolution, so
 *     `const fmt = customSerialize; fmt(x)` keys/matches as
 *     `customSerialize`, not `fmt`.
 *
 * No adapter populates the registry yet — the wiring is exercised here
 * via hand-built env objects. Phase 3 filled the Hono predicate; #2069
 * adds the plugin-matcher and alias seams.
 */

import { describe, test, expect } from 'bun:test'
import type { RelocateEnv } from '../../relocate'
import { isInlinableInTemplate } from '../../relocate'
import type { BindingKind } from '../../types'
import type { LoweringMatcher } from '../../lowering-registry'

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
    loweringMatchers: options?.loweringMatchers,
    aliasTargets: options?.aliasTargets,
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

/** A `LoweringMatcher` that recognises a bare-identifier call to `name`. */
function matcherFor(name: string): LoweringMatcher {
  return (callee, args) => {
    if (callee.kind !== 'identifier' || callee.name !== name) return null
    return { kind: 'helper-call', helper: 'test_helper', args }
  }
}

describe('isInlinableInTemplate — loweringMatchers acceptance (#2069)', () => {
  test('a call recognised by a registered matcher is accepted', () => {
    const env = envWith(
      [
        ['customSerialize', 'module-import'],
        ['config', 'prop'],
      ],
      {
        propsObjectName: null,
        loweringMatchers: [matcherFor('customSerialize')],
      },
    )
    const r = isInlinableInTemplate('customSerialize(config)', env)
    expect(r.ok).toBe(true)
    expect(r.rewrittenValue).toContain('customSerialize')
  })

  test('without a matching matcher, the call is still rejected', () => {
    const env = envWith(
      [
        ['customSerialize', 'module-import'],
        ['config', 'prop'],
      ],
      {
        propsObjectName: null,
        loweringMatchers: [matcherFor('someOtherHelper')],
      },
    )
    const r = isInlinableInTemplate('customSerialize(config)', env)
    expect(r.ok).toBe(false)
  })

  test('templatePrimitives / acceptsTemplateCall / loweringMatchers are all independent acceptance paths', () => {
    // Only the matcher accepts here — no string-keyed entry exists at all.
    const env = envWith(
      [
        ['customSerialize', 'module-import'],
        ['config', 'prop'],
      ],
      {
        propsObjectName: null,
        templatePrimitives: {},
        acceptsTemplateCall: () => false,
        loweringMatchers: [matcherFor('customSerialize')],
      },
    )
    const r = isInlinableInTemplate('customSerialize(config)', env)
    expect(r.ok).toBe(true)
  })

  describe('shadow guard applies to matcher acceptance too', () => {
    test('a local binding shadowing the recognised name is refused', () => {
      // `customSerialize` here is a component-local (e.g. reassigned from
      // a prop), NOT the module import the plugin's `prepare()` resolved
      // against. The matcher itself has no way to know this — the shadow
      // guard in `isCallAcceptedByAdapter` is what keeps it from firing.
      const env = envWith(
        [
          ['customSerialize', 'init-local'], // shadows the import
          ['config', 'prop'],
        ],
        {
          propsObjectName: null,
          loweringMatchers: [matcherFor('customSerialize')],
        },
      )
      const r = isInlinableInTemplate('customSerialize(config)', env)
      expect(r.ok).toBe(false)
    })

    test('module-import / module-local bindings still activate the matcher', () => {
      const env = envWith(
        [
          ['customSerialize', 'module-local'],
          ['config', 'prop'],
        ],
        {
          propsObjectName: null,
          loweringMatchers: [matcherFor('customSerialize')],
        },
      )
      const r = isInlinableInTemplate('customSerialize(config)', env)
      expect(r.ok).toBe(true)
    })
  })
})

describe('isInlinableInTemplate — one-hop alias resolution (#2069 R2)', () => {
  test('alias → registered builtin (templatePrimitives) is accepted', () => {
    // const fmt = Math.floor; fmt(score)
    const env = envWith(
      [
        ['fmt', 'init-local'],
        ['Math', 'global'],
        ['score', 'prop'],
      ],
      {
        propsObjectName: null,
        aliasTargets: new Map([['fmt', 'Math.floor']]),
        templatePrimitives: {
          'Math.floor': (args) => `Math.floor(${args[0]})`,
        },
      },
    )
    const r = isInlinableInTemplate('fmt(score)', env)
    expect(r.ok).toBe(true)
    expect(r.rewrittenValue).toContain('Math.floor')
  })

  test('aliased-namespace MEMBER callee resolves too (const m = Math; m.floor)', () => {
    // The leftmost segment is spliced and the `.path` tail carried over —
    // `m.floor(score)` keys the registry as `Math.floor` (Copilot review
    // on #2097 pinned that this is intended, not bare-identifier-only).
    const env = envWith(
      [
        ['m', 'init-local'],
        ['Math', 'global'],
        ['score', 'prop'],
      ],
      {
        propsObjectName: null,
        aliasTargets: new Map([['m', 'Math']]),
        templatePrimitives: {
          'Math.floor': (args) => `Math.floor(${args[0]})`,
        },
      },
    )
    const r = isInlinableInTemplate('m.floor(score)', env)
    expect(r.ok).toBe(true)
  })

  test('alias → a loweringMatchers-recognised import is accepted', () => {
    // const serialize = customSerialize; serialize(config)
    const env = envWith(
      [
        ['serialize', 'init-local'],
        ['customSerialize', 'module-import'],
        ['config', 'prop'],
      ],
      {
        propsObjectName: null,
        aliasTargets: new Map([['serialize', 'customSerialize']]),
        loweringMatchers: [matcherFor('customSerialize')],
      },
    )
    const r = isInlinableInTemplate('serialize(config)', env)
    expect(r.ok).toBe(true)
    expect(r.rewrittenValue).toContain('customSerialize')
  })

  test('alias → alias chain is refused — only ONE hop is resolved', () => {
    // const g = f (f is itself just another local, never resolved further)
    const env = envWith(
      [
        ['g', 'init-local'],
        ['f', 'init-local'],
        ['config', 'prop'],
      ],
      {
        propsObjectName: null,
        aliasTargets: new Map([['g', 'f']]),
        // Maximally permissive predicate — even this can't help, because
        // the shadow guard rejects on `f`'s own (unsafe) binding kind
        // before the predicate is ever consulted.
        acceptsTemplateCall: () => true,
      },
    )
    const r = isInlinableInTemplate('g(config)', env)
    expect(r.ok).toBe(false)
  })

  test('alias → a non-import component-local helper is refused', () => {
    // const h = helper (helper is a local function/const, not module-scope)
    const env = envWith(
      [
        ['h', 'init-local'],
        ['helper', 'init-local'],
        ['config', 'prop'],
      ],
      {
        propsObjectName: null,
        aliasTargets: new Map([['h', 'helper']]),
        acceptsTemplateCall: () => true,
      },
    )
    const r = isInlinableInTemplate('h(config)', env)
    expect(r.ok).toBe(false)
  })

  test('a plain non-alias init-local is unaffected by aliasTargets being present', () => {
    // Baseline: aliasTargets has entries for OTHER names, but this
    // reference isn't one of them — falls through to the ordinary
    // init-local fallback, same as if aliasTargets were absent.
    const env = envWith(
      [
        ['count', 'init-local'],
        ['config', 'prop'],
      ],
      {
        propsObjectName: null,
        aliasTargets: new Map([['fmt', 'Math.floor']]),
      },
    )
    const r = isInlinableInTemplate('count', env)
    expect(r.ok).toBe(true) // fallback to 'undefined', not a rejection
    expect(r.rewrittenValue).toBe('undefined')
  })
})
