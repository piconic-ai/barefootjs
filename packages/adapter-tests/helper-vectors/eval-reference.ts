/**
 * Reference implementation of the lightweight `ParsedExpr` evaluator
 * (issue #2018, Track A — the evaluator contract).
 *
 * This is the *semantic source of truth* for the pure-expression subset
 * each backend runtime (Go `bf.go`, shared Perl `Evaluator.pm`)
 * re-implements. Like the helper-vectors `reference` table, it is the
 * literal JS each construct lowers to (`a + b`, `Number(x)`, …), so the
 * golden `eval-vectors.json` encodes real JS engine behaviour and the
 * backends are held to JS parity.
 *
 * Scope: the evaluator is **only** for higher-order callback bodies
 * (`reduce` / `sort` / `map` / `filter` / `find` `(…) => expr`). Ordinary
 * expressions stay lowered to template-native syntax — this is not a
 * general expression engine. The accepted subset and its semantics are
 * documented in spec/compiler.md ("ParsedExpr Evaluator Semantics").
 *
 * The subset is intentionally narrow and deterministic so the three
 * backends stay byte-isomorphic:
 *   - numbers are IEEE-754 doubles with JS coercion;
 *   - string relational comparison is by code unit (locale-sensitive
 *     ops like `localeCompare` are deliberately OUT of the subset);
 *   - equality is strict (`===` / `!==`) only.
 *
 * Anything outside the subset throws `EvalUnsupported` — the same gate
 * the backends use to refuse a callback body (BF101 upstream).
 */
import type { ParsedExpr, TemplatePart } from '@barefootjs/jsx'

/** A runtime value in the evaluator's domain (JSON-shaped). */
export type EvalValue = string | number | boolean | null | EvalValue[] | { [k: string]: EvalValue }

/** The environment: `acc` / `item` / `index` plus captured free vars. */
export type EvalEnv = Record<string, EvalValue>

/** Thrown when a case uses a node/operator/builtin outside the subset. */
export class EvalUnsupported extends Error {}

// ---------------------------------------------------------------------------
// JS coercion primitives (ToNumber / ToString / ToBoolean), pinned so the
// backends match. These are the literal JS `Number()` / `String()` /
// truthiness rules, NOT the divergent `bf->string`/`bf_reduce` helper
// conventions — the evaluator is JS-faithful.
// ---------------------------------------------------------------------------

function toNumber(v: EvalValue): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === null) return 0
  if (typeof v === 'string') {
    const t = v.trim()
    if (t === '') return 0
    const n = Number(t)
    return n
  }
  // arrays/objects are out of the numeric subset
  throw new EvalUnsupported(`cannot coerce ${typeof v} to number`)
}

function toStr(v: EvalValue): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return numToStr(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (v === null) return 'null'
  throw new EvalUnsupported(`cannot coerce ${typeof v} to string`)
}

/** JS Number→String. Split out so the spec can name the one rule. */
function numToStr(n: number): string {
  return String(n)
}

function toBool(v: EvalValue): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
  if (typeof v === 'string') return v !== ''
  if (v === null) return false
  // arrays/objects are always truthy in JS
  return true
}

function isNullish(v: EvalValue): boolean {
  return v === null
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

function binary(op: string, l: EvalValue, r: EvalValue): EvalValue {
  switch (op) {
    case '+':
      // JS `+`: string concatenation once either operand is a string,
      // numeric addition otherwise.
      if (typeof l === 'string' || typeof r === 'string') return toStr(l) + toStr(r)
      return toNumber(l) + toNumber(r)
    case '-':
      return toNumber(l) - toNumber(r)
    case '*':
      return toNumber(l) * toNumber(r)
    case '/':
      return toNumber(l) / toNumber(r)
    case '%':
      return toNumber(l) % toNumber(r)
    case '<':
    case '<=':
    case '>':
    case '>=':
      return relational(op, l, r)
    case '===':
      return strictEquals(l, r)
    case '!==':
      return !strictEquals(l, r)
    default:
      // Loose equality (`==`/`!=`) and bitwise/shift operators are
      // intentionally NOT in the subset — their coercion is hard to keep
      // byte-isomorphic across backends.
      throw new EvalUnsupported(`binary operator '${op}' is not in the evaluator subset`)
  }
}

function relational(op: string, l: EvalValue, r: EvalValue): boolean {
  // JS Abstract Relational Comparison: both strings → compare by code
  // unit; otherwise coerce both to numbers (NaN makes every comparison
  // false).
  let c: number
  if (typeof l === 'string' && typeof r === 'string') {
    c = l < r ? -1 : l > r ? 1 : 0
  } else {
    const ln = toNumber(l)
    const rn = toNumber(r)
    if (Number.isNaN(ln) || Number.isNaN(rn)) return false
    c = ln < rn ? -1 : ln > rn ? 1 : 0
  }
  switch (op) {
    case '<':
      return c < 0
    case '<=':
      return c <= 0
    case '>':
      return c > 0
    case '>=':
      return c >= 0
  }
  return false
}

function strictEquals(l: EvalValue, r: EvalValue): boolean {
  // Strict `===`: same type, same value. Different types never equal.
  // Arrays/objects are reference types in JS; the subset only pins
  // primitive equality, so a structural operand is refused.
  if (typeof l === 'object' && l !== null) {
    throw new EvalUnsupported('=== on a non-primitive is not in the evaluator subset')
  }
  if (typeof r === 'object' && r !== null) {
    throw new EvalUnsupported('=== on a non-primitive is not in the evaluator subset')
  }
  return l === r
}

function unary(op: string, v: EvalValue): EvalValue {
  switch (op) {
    case '!':
      return !toBool(v)
    case '-':
      return -toNumber(v)
    case '+':
      return toNumber(v)
    default:
      throw new EvalUnsupported(`unary operator '${op}' is not in the evaluator subset`)
  }
}

// ---------------------------------------------------------------------------
// Built-in calls (the deterministic allowlist). Locale-sensitive and
// I/O-ish builtins are deliberately excluded to keep backends isomorphic.
// ---------------------------------------------------------------------------

/**
 * JS `Math.round` — the reference is literal JS, so it inherits JS's exact
 * semantics: a half rounds toward +Infinity (2.5→3, -2.5→-2) and the sign of
 * zero is preserved (-0.4 → -0, so `1 / Math.round(-0.4)` is -Infinity). The
 * backends approximate this with `floor(n + 0.5)`, which agrees on every
 * JSON-representable result — a -0 result serializes to 0 in the vectors, so
 * the sign-of-zero edge is not observable across the contract.
 */
function mathRound(n: number): number {
  return Math.round(n)
}

function callBuiltin(name: string, args: EvalValue[]): EvalValue {
  switch (name) {
    case 'Math.max':
      return Math.max(...args.map(toNumber))
    case 'Math.min':
      return Math.min(...args.map(toNumber))
    case 'Math.abs':
      return Math.abs(toNumber(args[0]))
    case 'Math.floor':
      return Math.floor(toNumber(args[0]))
    case 'Math.ceil':
      return Math.ceil(toNumber(args[0]))
    case 'Math.round':
      return mathRound(toNumber(args[0]))
    case 'String':
      return toStr(args[0])
    case 'Number':
      return toNumber(args[0])
    case 'Boolean':
      return toBool(args[0])
    default:
      throw new EvalUnsupported(`builtin '${name}' is not in the evaluator subset`)
  }
}

/** Resolve a `call` callee to its builtin name (e.g. `Math.max`). */
function builtinName(callee: ParsedExpr): string | null {
  if (callee.kind === 'identifier') return callee.name
  if (callee.kind === 'member' && !callee.computed && callee.object.kind === 'identifier') {
    return `${callee.object.name}.${callee.property}`
  }
  return null
}

// ---------------------------------------------------------------------------
// Member / index access
// ---------------------------------------------------------------------------

function readProperty(obj: EvalValue, key: string): EvalValue {
  if (typeof obj === 'string') {
    if (key === 'length') return obj.length
    throw new EvalUnsupported(`property '${key}' on a string is not in the evaluator subset`)
  }
  if (Array.isArray(obj)) {
    if (key === 'length') return obj.length
    throw new EvalUnsupported(`property '${key}' on an array is not in the evaluator subset`)
  }
  if (obj !== null && typeof obj === 'object') {
    // Own-property only: a missing field reads as `null` (the backends'
    // single absent value). `key in obj` would walk the prototype chain and
    // surface `toString` / `constructor` as "present", returning non-JSON
    // values that Go maps / Perl hashes have no analogue for.
    return Object.prototype.hasOwnProperty.call(obj, key) ? (obj as { [k: string]: EvalValue })[key] : null
  }
  throw new EvalUnsupported(`cannot read property '${key}' of ${obj === null ? 'null' : typeof obj}`)
}

function readIndex(obj: EvalValue, index: EvalValue): EvalValue {
  if (Array.isArray(obj)) {
    const i = toNumber(index)
    if (!Number.isInteger(i) || i < 0 || i >= obj.length) return null
    return obj[i]
  }
  if (obj !== null && typeof obj === 'object') {
    return readProperty(obj, toStr(index))
  }
  throw new EvalUnsupported(`cannot index ${obj === null ? 'null' : typeof obj}`)
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export function evaluate(expr: ParsedExpr, env: EvalEnv): EvalValue {
  switch (expr.kind) {
    case 'literal':
      return expr.value

    case 'identifier': {
      if (!(expr.name in env)) {
        throw new EvalUnsupported(`unbound identifier '${expr.name}'`)
      }
      return env[expr.name]
    }

    case 'binary':
      return binary(expr.op, evaluate(expr.left, env), evaluate(expr.right, env))

    case 'unary':
      return unary(expr.op, evaluate(expr.argument, env))

    case 'logical': {
      const left = evaluate(expr.left, env)
      if (expr.op === '&&') return toBool(left) ? evaluate(expr.right, env) : left
      if (expr.op === '||') return toBool(left) ? left : evaluate(expr.right, env)
      // `??`
      return isNullish(left) ? evaluate(expr.right, env) : left
    }

    case 'conditional':
      return toBool(evaluate(expr.test, env))
        ? evaluate(expr.consequent, env)
        : evaluate(expr.alternate, env)

    case 'member':
      return readProperty(evaluate(expr.object, env), expr.property)

    case 'index-access':
      return readIndex(evaluate(expr.object, env), evaluate(expr.index, env))

    case 'call': {
      const name = builtinName(expr.callee)
      if (name === null) {
        throw new EvalUnsupported('only built-in calls (Math.*, String/Number/Boolean) are in the subset')
      }
      return callBuiltin(name, expr.args.map((a) => evaluate(a, env)))
    }

    case 'template-literal':
      return expr.parts.map((p: TemplatePart) => (p.type === 'string' ? p.value : toStr(evaluate(p.expr, env)))).join('')

    case 'array-literal':
      return expr.elements.map((e) => evaluate(e, env))

    case 'object-literal': {
      const out: { [k: string]: EvalValue } = {}
      for (const prop of expr.properties) out[prop.key] = evaluate(prop.value, env)
      return out
    }

    default:
      // arrow-fn, higher-order, array-method, unsupported: a callback
      // body that itself contains these is refused (BF101 upstream).
      throw new EvalUnsupported(`node kind '${expr.kind}' is not in the evaluator subset`)
  }
}
