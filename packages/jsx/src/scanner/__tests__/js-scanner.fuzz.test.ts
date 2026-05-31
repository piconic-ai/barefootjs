import { describe, test, expect } from 'bun:test'
import {
  replaceInExprContexts,
  findInterpolationEnd,
  findTopLevelTemplateLiterals,
} from '../js-scanner'
import { tokenContainsIdent, wrapLoopParamAsAccessor } from '../../ir-to-client-js/utils'

/**
 * Fuzz harness for the shared `ts.createScanner`-based JS-text scanner (#1370).
 *
 * The bug class this issue targets — hand-rolled char-by-char scanners that
 * disagree about where "code context" ends — only shows up on inputs that mix
 * quotes, comments, escapes and regex tokens in adversarial ways. The
 * example-based suite in `js-scanner.test.ts` pins specific known cases; this
 * file generates random combinations and asserts that *every* consumer of the
 * shared lexer honours the same invariant:
 *
 *   a bare `MARK` identifier is a real code reference **iff** it sits in
 *   expression context — never when it appears inside a string, template
 *   string body, comment or regex literal.
 *
 * Each generated input is paired with an exact oracle computed from the atoms
 * it was assembled from, so the assertions are precise (not just "didn't
 * throw"). Generation is seeded per-iteration with a deterministic PRNG, and
 * the seed + input are surfaced on failure so any regression reproduces.
 */

// --- deterministic PRNG (mulberry32) ---------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!

// Alphabet deliberately loaded with the delimiters that fooled the old
// per-consumer scanners: every quote flavour, comment markers, regex slashes,
// braces, escapes and the marker letters themselves.
const NOISE_ALPHABET = [
  'a', 'M', 'A', 'R', 'K', 'q', 'z', ' ',
  "'", '"', '`', '/', '*', '{', '}', '$', '\\', ';', '(', ')', '[', ']',
] as const

function randNoise(rng: () => number, maxLen = 10): string {
  const len = Math.floor(rng() * (maxLen + 1))
  let s = ''
  for (let i = 0; i < len; i++) s += pick(rng, NOISE_ALPHABET)
  return s
}

// --- per-context sanitizers: make `raw` safe to embed without changing how it
//     lexes, so the embedded text round-trips byte-for-byte in the oracle. ---
const escDouble = (raw: string) => raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, '')
const escSingle = (raw: string) => raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, '')
// No-substitution template: kill backticks and any `${` interpolation opener.
const escTemplate = (raw: string) => raw.replace(/\\/g, '\\\\').replace(/`/g, '').replace(/\$/g, '').replace(/[\r\n]/g, '')
const escLine = (raw: string) => raw.replace(/[\r\n]/g, '')
const escBlock = (raw: string) => raw.replace(/[\r\n]/g, '').replace(/\*\//g, '* /')
// Regex body: escape the delimiter and drop char-class brackets so the literal
// always terminates at the next `/`. Prefix a literal char so it is never empty
// (which would read as `//` line comment) nor start with `*`.
const escRegex = (raw: string) =>
  'x' + raw.replace(/\\/g, '\\\\').replace(/\//g, '\\/').replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/[\r\n]/g, '')

interface Atom {
  /** Source text of the atom as it appears in the input. */
  src: string
  /** What this atom becomes after a `MARK` -> `MARK()` expression-context rewrite. */
  rewritten: string
  /** True only for a bare-identifier `MARK` sitting in code context. */
  isCodeMarker: boolean
}

// Plain code fragments that carry no `MARK` and no structural `{`/`}` (so the
// only top-level braces in any input come from the `${...}` wrap we add later).
const CODE_PLAIN = ['a', 'b.c', 'foo(1)', 'arr[0]', 'n / 2', 'x + y', 'obj.prop', '1.5'] as const

function makeAtom(rng: () => number): Atom {
  const kind = pick(rng, [
    'codeMarker', 'codeMarker', 'codePlain',
    'dq', 'sq', 'tmpl', 'line', 'block', 'regex',
  ] as const)
  switch (kind) {
    case 'codeMarker':
      return { src: 'MARK', rewritten: 'MARK()', isCodeMarker: true }
    case 'codePlain': {
      const src = pick(rng, CODE_PLAIN)
      return { src, rewritten: src, isCodeMarker: false }
    }
    case 'dq': {
      const src = '"' + escDouble(randNoise(rng)) + '"'
      return { src, rewritten: src, isCodeMarker: false }
    }
    case 'sq': {
      const src = "'" + escSingle(randNoise(rng)) + "'"
      return { src, rewritten: src, isCodeMarker: false }
    }
    case 'tmpl': {
      const src = '`' + escTemplate(randNoise(rng)) + '`'
      return { src, rewritten: src, isCodeMarker: false }
    }
    case 'line': {
      // Trailing newline terminates the comment so the joining ` + ` that
      // follows stays in code context.
      const src = '// ' + escLine(randNoise(rng)) + '\n'
      return { src, rewritten: src, isCodeMarker: false }
    }
    case 'block': {
      const src = '/* ' + escBlock(randNoise(rng)) + ' */'
      return { src, rewritten: src, isCodeMarker: false }
    }
    case 'regex': {
      const src = '/' + escRegex(randNoise(rng)) + '/' + pick(rng, ['', 'g', 'i', 'gi', 'm'])
      return { src, rewritten: src, isCodeMarker: false }
    }
  }
}

interface Generated {
  input: string
  /** Input after every code-context `MARK` is rewritten to `MARK()`. */
  expected: string
  /** Whether at least one `MARK` reference lives in code context. */
  hasCodeMarker: boolean
}

function generate(rng: () => number): Generated {
  const count = 1 + Math.floor(rng() * 8)
  const atoms: Atom[] = []
  for (let i = 0; i < count; i++) atoms.push(makeAtom(rng))
  // ` + ` keeps the stream lexable and puts every regex atom in a
  // regex-start position (after an operator).
  const input = atoms.map(a => a.src).join(' + ')
  const expected = atoms.map(a => a.rewritten).join(' + ')
  const hasCodeMarker = atoms.some(a => a.isCodeMarker)
  return { input, expected, hasCodeMarker }
}

const ITERATIONS = 600

describe('js-scanner fuzz: code-context opacity holds across all consumers', () => {
  test('replaceInExprContexts rewrites MARK only outside strings/comments/regex/templates', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const seed = (0x9e3779b9 ^ i) >>> 0
      const { input, expected } = generate(mulberry32(seed))
      const got = replaceInExprContexts(input, /\bMARK\b/g, 'MARK()')
      expect(got, `seed=${seed} input=${JSON.stringify(input)}`).toBe(expected)
    }
  })

  test('wrapLoopParamAsAccessor agrees with replaceInExprContexts on the same inputs', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const seed = (0x85ebca6b ^ i) >>> 0
      const { input, expected } = generate(mulberry32(seed))
      const got = wrapLoopParamAsAccessor(input, 'MARK')
      expect(got, `seed=${seed} input=${JSON.stringify(input)}`).toBe(expected)
    }
  })

  test('tokenContainsIdent reports MARK iff a code-context occurrence exists', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const seed = (0xc2b2ae35 ^ i) >>> 0
      const { input, hasCodeMarker } = generate(mulberry32(seed))
      const got = tokenContainsIdent(input, 'MARK')
      expect(got, `seed=${seed} input=${JSON.stringify(input)}`).toBe(hasCodeMarker)
    }
  })

  test('findInterpolationEnd finds the real closing brace despite braces in noise', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const seed = (0x27d4eb2f ^ i) >>> 0
      const { input } = generate(mulberry32(seed))
      // Braces only appear inside opaque tokens (strings/regex/comments/
      // templates) of `input`; the wrap adds the single top-level pair.
      const wrapped = '${' + input + '}'
      const end = findInterpolationEnd(wrapped, 2)
      expect(end, `seed=${seed} wrapped=${JSON.stringify(wrapped)}`).toBe(wrapped.length - 1)
    }
  })
})

// findTopLevelTemplateLiterals operates on a ternary shape; fuzz its branch
// bodies with noise that must stay inside the backtick literals.
describe('js-scanner fuzz: findTopLevelTemplateLiterals extracts noisy branches', () => {
  test('returns both backtick branches verbatim regardless of embedded delimiters', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const seed = (0x165667b1 ^ i) >>> 0
      const rng = mulberry32(seed)
      const a = escTemplate(randNoise(rng))
      const b = escTemplate(randNoise(rng))
      const src = 'cond ? `' + a + '` : `' + b + '`'
      const got = findTopLevelTemplateLiterals(src)
      expect(got, `seed=${seed} src=${JSON.stringify(src)}`).toEqual([a, b])
    }
  })
})
