/**
 * Generative divergence probe for the ParsedExpr evaluator (issue #2018
 * evaluator contract, spec/compiler.md "ParsedExpr Evaluator Semantics").
 *
 * WHY THIS EXISTS
 * ---------------
 * The committed `eval-vectors.json` corpus is hand-written, so it only
 * guards the expression × value combinations someone thought to enumerate.
 * That is exactly how the `Number("5.")` Ruby crash and the Go
 * `"1_000"` / hex-float over-acceptance sat green for so long — no case
 * exercised them. This tool closes that gap SYSTEMATICALLY: it crosses a
 * small set of expression TEMPLATES (one per evaluator-subset feature)
 * with a curated corpus of "spicy" VALUES (the edge inputs where JS
 * coercion is subtle), producing thousands of cases whose expected value
 * is computed by the JS reference evaluator (eval-reference.ts) — a free,
 * always-correct oracle. Every backend evaluator (Go / Ruby / Perl /
 * Python / PHP) is then replayed over the same generated corpus by the
 * per-backend runners in this directory; the `run-probe.ts` driver diffs
 * each backend against the JS reference.
 *
 * It is NOT the committed conformance corpus — nothing here ships. It is a
 * discovery harness: run it, triage any NEW divergence into either a fix
 * (then add the case to eval-cases.ts) or a documented limitation (then
 * flag it `known` below so the probe stays green on it).
 *
 * DETERMINISM: pure enumeration, no RNG / Date — the same checkout always
 * produces byte-identical probe-vectors.json.
 *
 *   cd packages/adapter-tests && bun vectors/probe/generate-probe.ts
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExpression, type ParsedExpr } from '@barefootjs/jsx'
import { encodeExpect } from '../generate'
import { evaluate, EvalUnsupported, type EvalEnv, type EvalValue } from '../eval-reference'

const HERE = dirname(fileURLToPath(import.meta.url))

/** A corpus value, optionally flagged as living in a documented-divergence family. */
interface Val {
  v: EvalValue
  /** True when JS parity here is a KNOWN, spec-documented limitation (not a bug). */
  known?: boolean
  /** Short label for the value, used in the case note. */
  label: string
}

const val = (v: EvalValue, label: string, known = false): Val => ({ v, label, known })

// A number is a "hard" stringification when JS String(n) needs >15 significant
// digits or exponential notation — the documented float-stringify / big-number
// divergence region (spec/compiler.md reduce/sort caveat; Perl %g, Go/PHP
// exponent formatting).
const hardNum = (v: number, label: string): Val => ({ v, label, known: true })

// ---------------------------------------------------------------------------
// Value corpora
// ---------------------------------------------------------------------------

const NUMS: Val[] = [
  val(0, '0'), val(-0, '-0'), val(1, '1'), val(-7, '-7'), val(42, '42'),
  val(3.14, '3.14'), val(0.5, '0.5'), val(2.5, '2.5'), val(-2.5, '-2.5'),
  hardNum(0.1 + 0.2, '0.1+0.2'), hardNum(1e21, '1e21'), hardNum(1e-7, '1e-7'),
  hardNum(-1e-7, '-1e-7'), hardNum(123456789012345680000, 'bigint-ish'),
  val(100, '100'), val(-3.2, '-3.2'), val(3.7, '3.7'),
]

// Numeric-ish strings: the JS StringToNumber grammar surface. Radix-integer
// forms are the documented divergence region (Go/Perl/Python/PHP → NaN, Ruby
// parses hex), so flag them known.
const NUMSTRS: Val[] = [
  val('42', '"42"'), val('3.14', '"3.14"'), val('5.', '"5."'), val('.5', '".5"'),
  val('+7', '"+7"'), val('-0.5', '"-0.5"'), val('1e3', '"1e3"'),
  val('  42  ', '"  42  "'), val('', '""'), val('   ', '"spaces"'),
  val('12px', '"12px"'), val('1_000', '"1_000"'), val('0x1p4', '"0x1p4"'),
  val('1e1000', '"1e1000"'), val('-1e1000', '"-1e1000"'), val('Infinity', '"Infinity"'),
  val('NaN', '"NaN"'),
  val('0x1F', '"0x1F"', true), val('0b101', '"0b101"', true), val('0o17', '"0o17"', true),
]

// General strings. Non-ASCII flagged known: string ops are ASCII-domain by
// spec (`.length` differs — UTF-16 units in JS vs codepoints/bytes on hosts).
const STRS: Val[] = [
  val('', '""'), val('a', '"a"'), val('abcd', '"abcd"'), val('0', '"0"'),
  val('hello world', '"hello world"'), val('café', '"café"', true),
  val('😀', '"😀"', true), val('a😀b', '"a😀b"', true), val('日本', '"日本"', true),
  val('ﾊ', '"ﾊ"', true),
]

const BOOLS: Val[] = [val(true, 'true'), val(false, 'false')]
const NULLISH: Val[] = [val(null, 'null')]

// ---------------------------------------------------------------------------
// Expression templates. Each yields cases by crossing over its value pools.
// `category` groups the feature; `known` on a produced case is OR-ed from the
// contributing values.
// ---------------------------------------------------------------------------

interface Case {
  src: string
  env: EvalEnv
  category: string
  known: boolean
  note: string
}

const cases: Case[] = []

function emit(src: string, env: EvalEnv, category: string, known: boolean, note: string) {
  cases.push({ src, env, category, known, note })
}

// Number(item.s) over the numeric-string grammar + general strings.
for (const s of [...NUMSTRS, ...STRS]) {
  emit('Number(item.s)', { item: { s: s.v } }, 'number-coerce', !!s.known, `Number(${s.label})`)
}

// String(item.n) over the number corpus.
for (const n of NUMS) {
  emit('String(item.n)', { item: { n: n.v } }, 'string-of-number', !!n.known, `String(${n.label})`)
}

// Template literal stringifying a number / bool / null.
for (const n of [...NUMS, ...BOOLS, ...NULLISH]) {
  emit('`v=${item.n}`', { item: { n: n.v } }, 'template-stringify', !!n.known, `\`v=${n.label}\``)
}

// `+`: numeric addition vs string concatenation, across number/numeric-string/string pairs.
const PLUS_L = [...NUMS.slice(0, 6), val('x', '"x"'), val('n=', '"n="')]
const PLUS_R = [...NUMS.slice(0, 6), val('y', '"y"'), val('5', '"5"')]
for (const a of PLUS_L)
  for (const b of PLUS_R)
    emit('item.a + item.b', { item: { a: a.v, b: b.v } }, 'plus', !!(a.known || b.known), `${a.label} + ${b.label}`)

// Arithmetic (numeric only): - * / %.
for (const op of ['-', '*', '/', '%']) {
  for (const a of NUMS.slice(0, 8))
    for (const b of [val(3, '3'), val(0, '0'), val(-2, '-2'), val(2.5, '2.5')])
      emit(`item.a ${op} item.b`, { item: { a: a.v, b: b.v } }, 'arith', !!a.known, `${a.label} ${op} ${b.label}`)
}

// Relational + strict equality across mixed operand types.
const CMP = [val(1, '1'), val(2, '2'), val('10', '"10"'), val('9', '"9"'), val('B', '"B"'), val('a', '"a"'), val(0, '0'), val(null, 'null'), val(false, 'false')]
for (const op of ['<', '<=', '>', '>=', '===', '!==']) {
  for (const a of CMP)
    for (const b of CMP)
      emit(`item.a ${op} item.b`, { item: { a: a.v, b: b.v } }, 'compare', false, `${a.label} ${op} ${b.label}`)
}

// Unary + - ! over strings / numbers / null / bool.
for (const s of NUMSTRS) emit('+item.s', { item: { s: s.v } }, 'number-coerce', !!s.known, `+${s.label}`)
for (const n of NUMS) emit('-item.n', { item: { n: n.v } }, 'arith', !!n.known, `-${n.label}`)
for (const x of [...BOOLS, ...NULLISH, val('', '""'), val('0', '"0"'), val(0, '0')])
  emit('!item.x', { item: { x: x.v } }, 'truthy', false, `!${x.label}`)

// String .length (ASCII-domain; non-ASCII known-divergent).
for (const s of STRS) emit('item.s.length', { item: { s: s.v } }, 'string-length', !!s.known, `${s.label}.length`)

// Boolean(x) coercion.
for (const x of [...NUMS.slice(0, 6), ...STRS.slice(0, 5), ...NULLISH, ...BOOLS])
  emit('Boolean(item.x)', { item: { x: x.v } }, 'truthy', false, `Boolean(${x.label})`)

// Math.* over the number corpus.
for (const fn of ['floor', 'ceil', 'round', 'abs']) {
  for (const n of NUMS) emit(`Math.${fn}(item.n)`, { item: { n: n.v } }, 'math', !!n.known, `Math.${fn}(${n.label})`)
}

// Array .includes / .join / nested .map(.length).
const ARRS: Array<{ v: EvalValue[]; label: string }> = [
  { v: [1, 2, 3], label: '[1,2,3]' },
  { v: ['a', 'b'], label: '["a","b"]' },
  { v: [1, null, 3], label: '[1,null,3]' },
  { v: [], label: '[]' },
]
for (const a of ARRS) {
  for (const needle of [val(2, '2'), val('a', '"a"'), val('2', '"2"'), val(null, 'null')])
    emit('item.a.includes(x)', { item: { a: a.v }, x: needle.v }, 'array-includes', false, `${a.label}.includes(${needle.label})`)
  for (const sep of [val(',', '","'), val('-', '"-"'), val('', '""')])
    emit('item.a.join(sep)', { item: { a: a.v }, sep: sep.v }, 'array-join', false, `${a.label}.join(${sep.label})`)
}
// Nested .map over unicode string lengths (known-divergent for astral inputs).
emit('item.a.map(t => t.length)', { item: { a: ['a', 'café', '😀'] } }, 'string-length', true, '["a","café","😀"].map(.length)')
emit('item.a.map(t => t.length)', { item: { a: ['ab', 'cde'] } }, 'string-length', false, '["ab","cde"].map(.length)')

// ---------------------------------------------------------------------------
// Filter to the parseExpression-accepted, JS-evaluable subset and freeze.
// ---------------------------------------------------------------------------

interface OutCase {
  src: string
  expr: ParsedExpr
  env: EvalEnv
  expect: unknown
  category: string
  known: boolean
  note: string
}

const out: OutCase[] = []
let droppedParse = 0
let droppedEval = 0
for (const c of cases) {
  const expr = parseExpression(c.src)
  if (expr.kind === 'unsupported') {
    droppedParse++
    continue
  }
  let expect: unknown
  try {
    expect = encodeExpect(evaluate(expr, c.env), c.note)
  } catch (e) {
    if (e instanceof EvalUnsupported) {
      droppedEval++
      continue
    }
    throw e
  }
  out.push({ src: c.src, expr, env: c.env, expect, category: c.category, known: c.known, note: c.note })
}

const outPath = join(HERE, 'probe-vectors.json')
writeFileSync(
  outPath,
  JSON.stringify({ version: 1, generator: 'generate-probe', cases: out }, null, 2) + '\n',
)
const knownCount = out.filter((c) => c.known).length
console.log(
  `wrote ${out.length} probe cases (${knownCount} flagged known-divergence) ` +
    `— dropped ${droppedParse} unparsable, ${droppedEval} out-of-subset`,
)
