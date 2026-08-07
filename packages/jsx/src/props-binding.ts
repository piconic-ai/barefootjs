import ts from 'typescript'
import type { ParamInfo } from './types.ts'

/**
 * Authoritative IdentifierName classification for a destructure-pattern
 * property key, built on TS's own `isIdentifierStart` / `isIdentifierPart`
 * primitives (Unicode-aware, stays aligned with what TS itself accepts as
 * a bare property key). Mirrors the `isIdent` precedent in
 * `jsx-to-ir.ts` (#1244) — a source key like `data-key` or `aria-label`
 * can't be emitted as a bare `key: local` destructure and must be quoted
 * (`"data-key": local`).
 */
export function isIdentifierName(key: string): boolean {
  if (key.length === 0) return false
  for (let i = 0; i < key.length; ) {
    const cp = key.codePointAt(i)!
    const ok = i === 0
      ? ts.isIdentifierStart(cp, ts.ScriptTarget.Latest)
      : ts.isIdentifierPart(cp, ts.ScriptTarget.Latest)
    if (!ok) return false
    i += cp > 0xFFFF ? 2 : 1
  }
  return true
}

/**
 * The single destructure-binding renderer for a props param, shared by
 * every JSX-runtime SSR adapter (Hono, TestAdapter). The caller-facing
 * key is `sourceName ?? name` (ParamInfo's own rule) — `name` is only
 * ever the LOCAL binding. Emits the plain shorthand when they match
 * (byte-identical to the pre-rename-aware form); emits a `key: local`
 * rename otherwise (b4f5075). This also covers the `class` → `className`
 * rename: a source prop literally named `class` can only reach
 * `propsParams` via an aliased destructure (`{ class: className }` —
 * `class` is a reserved word, so it can never be an un-aliased binding),
 * which sets `sourceName: 'class'` and takes the rename branch
 * (`class: className`), not a bare `className`.
 *
 * One exported implementation, two consumers, zero drift — the
 * hono/test-adapter pair carrying private copies is exactly the
 * lockstep-rule duplication #2460/#2524 were about.
 */
export function propsDestructureBinding(p: ParamInfo): string {
  const callerKey = p.sourceName ?? p.name
  const localName = p.name
  const binding = callerKey === localName
    ? localName
    : `${isIdentifierName(callerKey) ? callerKey : JSON.stringify(callerKey)}: ${localName}`
  return p.defaultValue ? `${binding} = ${p.defaultValue}` : binding
}

/**
 * Local-name → caller-facing-key map for prop-reference rewrites —
 * entries only for `ParamInfo`s that actually rename (`sourceName` set,
 * see its docstring in `types.ts`). `_p` is always keyed by the
 * caller-facing name (#2524 CSR half); an un-aliased prop leaves no
 * entry, so `map?.get(name) ?? name` degrades to an identity there.
 * Returns `undefined` when nothing renames, so callers can
 * short-circuit.
 */
export function buildPropAliasMap(params: readonly ParamInfo[]): Map<string, string> | undefined {
  let map: Map<string, string> | undefined
  for (const p of params) {
    if (p.sourceName) {
      if (!map) map = new Map()
      map.set(p.name, p.sourceName)
    }
  }
  return map
}
