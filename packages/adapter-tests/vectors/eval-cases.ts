/**
 * Golden-vector case definitions for the lightweight `ParsedExpr`
 * evaluator (issue #2018, Track A — the evaluator contract).
 *
 * These pin the pure-expression subset's semantics (eval order,
 * numeric/string coercion, equality, allowed operators/builtins) that
 * each backend runtime (Go `bf.go`, shared Perl `Evaluator.pm`)
 * re-implements. They are the cross-language *contract*: an expression
 * tree plus an environment (`{acc, item, …captured free vars}`) maps to
 * one expected value.
 *
 * A case is authored as a JS source string plus an environment. The
 * generator (eval-generate.ts) parses the source with the real compiler
 * `parseExpression` — so every vector carries a genuine `ParsedExpr`
 * tree, never a hand-transcribed one — and computes `expect` by running
 * the JS reference evaluator (eval-reference.ts). JS parity is therefore
 * mechanical, exactly like cases.ts.
 *
 * Each case should pin a rule stated in the spec's "ParsedExpr
 * Evaluator Semantics" section, named by its `note`.
 */
import type { EvalEnv } from './eval-reference'

export interface EvalCase {
  /** A JS callback-body expression; parsed to a `ParsedExpr` tree. */
  src: string
  /** The environment the tree is evaluated against (`acc`/`item`/free vars). */
  env: EvalEnv
  /** Which spec rule this case pins. Copied into eval-vectors.json. */
  note: string
}

export const evalCases: EvalCase[] = [
  // ----- literals & identifiers -------------------------------------------
  { src: '42', env: {}, note: 'numeric literal' },
  { src: "'hi'", env: {}, note: 'string literal' },
  { src: 'true', env: {}, note: 'boolean literal' },
  { src: 'null', env: {}, note: 'null literal' },
  { src: 'acc', env: { acc: 7 }, note: 'identifier reads from the environment' },
  { src: 'item', env: { item: { price: 5 } }, note: 'identifier binds a structured value' },

  // ----- arithmetic: numeric addition vs string concatenation -------------
  { src: 'acc + item', env: { acc: 1, item: 2 }, note: 'numeric + adds' },
  { src: 'acc + item.price', env: { acc: 10, item: { price: 5 } }, note: 'reduce body: acc + field projection' },
  { src: "acc + item", env: { acc: 'x', item: 'y' }, note: '+ concatenates once an operand is a string' },
  { src: "acc + item", env: { acc: 'n=', item: 5 }, note: '+ string/number coerces the number to string' },
  { src: 'acc - item', env: { acc: 5, item: 3 }, note: 'numeric subtraction' },
  { src: 'acc - item', env: { acc: '5', item: 2 }, note: '- coerces a numeric string to number' },
  { src: 'a * b', env: { a: 3, b: 4 }, note: 'multiplication' },
  { src: 'a / b', env: { a: 7, b: 2 }, note: 'division yields a double' },
  { src: 'a % b', env: { a: 7, b: 3 }, note: 'modulo' },
  { src: 'true + 1', env: {}, note: 'boolean true coerces to 1 under numeric +' },
  { src: 'null + 1', env: {}, note: 'null coerces to 0 under numeric +' },

  // ----- unary ------------------------------------------------------------
  { src: '-acc', env: { acc: 5 }, note: 'unary minus negates' },
  { src: '+item', env: { item: '8' }, note: 'unary plus coerces a numeric string' },
  { src: '!item.done', env: { item: { done: false } }, note: 'logical not of a falsy field is true' },
  { src: '!item.done', env: { item: { done: true } }, note: 'logical not of a truthy field is false' },

  // ----- relational comparison --------------------------------------------
  { src: 'a < b', env: { a: 1, b: 2 }, note: 'numeric less-than' },
  { src: 'a >= b', env: { a: 2, b: 2 }, note: 'numeric greater-or-equal at the boundary' },
  { src: 'a < b', env: { a: 'apple', b: 'banana' }, note: 'string relational compares by code unit' },
  { src: 'a < b', env: { a: 'B', b: 'a' }, note: 'code-unit order is case-sensitive (uppercase before lowercase)' },
  { src: "a < b", env: { a: '10', b: '9' }, note: 'two numeric strings compare lexically, not numerically' },

  // ----- strict equality --------------------------------------------------
  { src: 'item.id === 2', env: { item: { id: 2 } }, note: 'strict equality on equal numbers' },
  { src: 'item.id === 2', env: { item: { id: 3 } }, note: 'strict equality on unequal numbers' },
  { src: "item.id === 2", env: { item: { id: '2' } }, note: 'strict equality is false across number/string' },
  { src: "item.status !== 'done'", env: { item: { status: 'open' } }, note: 'strict inequality on strings' },

  // ----- logical (operand-returning + short-circuit) ----------------------
  { src: 'item.done && item.priority > 3', env: { item: { done: true, priority: 5 } }, note: 'filter body: && both truthy' },
  { src: 'item.done && item.priority > 3', env: { item: { done: false, priority: 5 } }, note: '&& short-circuits on a falsy left, returning it' },
  { src: "item.label || 'untitled'", env: { item: { label: '' } }, note: '|| falls through an empty string to the default' },
  { src: "item.label || 'untitled'", env: { item: { label: 'set' } }, note: '|| returns the truthy left operand' },
  { src: 'item.qty ?? 0', env: { item: { qty: 0 } }, note: '?? keeps a present zero (only null coalesces)' },
  { src: 'item.qty ?? 0', env: { item: { qty: null } }, note: '?? coalesces a null to the default' },
  { src: 'item.missing ?? 9', env: { item: {} }, note: '?? coalesces a missing field (reads as null)' },

  // ----- conditional (ternary), incl. the sort 3-way comparator -----------
  { src: "item.n ? 'y' : 'n'", env: { item: { n: 0 } }, note: 'ternary test: 0 is falsy' },
  { src: "item.s ? 'y' : 'n'", env: { item: { s: '0' } }, note: 'ternary test: the string "0" is truthy' },
  { src: 'a > b ? 1 : a < b ? -1 : 0', env: { a: 5, b: 3 }, note: 'sort comparator: 3-way ternary, greater branch' },
  { src: 'a > b ? 1 : a < b ? -1 : 0', env: { a: 3, b: 3 }, note: 'sort comparator: 3-way ternary, equal branch' },

  // ----- member / index access --------------------------------------------
  { src: 'item.a.b', env: { item: { a: { b: 42 } } }, note: 'nested member access' },
  { src: 'item.missing', env: { item: {} }, note: 'a missing field reads as null' },
  { src: 'item.tags.length', env: { item: { tags: ['x', 'y', 'z'] } }, note: '.length on an array field' },
  { src: 'item.name.length', env: { item: { name: 'abcd' } }, note: '.length on a string field' },
  { src: 'item[i]', env: { item: [10, 20, 30], i: 1 }, note: 'index access by a numeric variable' },
  { src: 'item[i]', env: { item: [10, 20], i: 5 }, note: 'out-of-range index reads as null' },
  { src: 'row[k]', env: { row: { price: 9 }, k: 'price' }, note: 'index access into an object by a string key' },

  // ----- template literal -------------------------------------------------
  { src: '`${item.id}: ${item.name}`', env: { item: { id: 7, name: 'widget' } }, note: 'template literal interpolates and stringifies parts' },
  { src: '`n=${acc + 1}`', env: { acc: 4 }, note: 'template literal evaluates an embedded expression' },

  // ----- array / object literals ------------------------------------------
  { src: '[item.a, item.b]', env: { item: { a: 1, b: 2 } }, note: 'array literal of field projections' },
  { src: '({ id: item.id, doubled: item.n * 2 })', env: { item: { id: 3, n: 4 } }, note: 'object literal: map body building a new record' },

  // ----- built-in calls (the deterministic allowlist) ---------------------
  { src: 'Math.max(a, b)', env: { a: 3, b: 7 }, note: 'Math.max of two numbers' },
  { src: 'Math.min(a, b, c)', env: { a: 3, b: 7, c: 1 }, note: 'Math.min is variadic' },
  { src: 'Math.abs(acc)', env: { acc: -5 }, note: 'Math.abs' },
  { src: 'Math.floor(item.x)', env: { item: { x: 3.7 } }, note: 'Math.floor truncates toward -Infinity' },
  { src: 'Math.ceil(item.x)', env: { item: { x: 3.2 } }, note: 'Math.ceil rounds up' },
  { src: 'Math.round(item.x)', env: { item: { x: 2.5 } }, note: 'Math.round: positive half rounds toward +Infinity' },
  { src: 'Math.round(item.x)', env: { item: { x: -2.5 } }, note: 'Math.round: negative half rounds toward +Infinity (to -2)' },
  { src: 'String(item.n)', env: { item: { n: 42 } }, note: 'String() coerces a number' },
  { src: 'Number(item.s)', env: { item: { s: '3.14' } }, note: 'Number() parses a numeric string' },
  { src: 'Boolean(item.s)', env: { item: { s: '' } }, note: 'Boolean() of an empty string is false' },

  // ----- array-method: includes --------------------------------------------
  { src: "item.tags.includes('go')", env: { item: { tags: ['perl', 'go'] } }, note: 'array .includes: hit' },
  { src: "item.tags.includes('rust')", env: { item: { tags: ['perl', 'go'] } }, note: 'array .includes: miss' },
  { src: 'nums.includes(2)', env: { nums: [1, 2, 3] }, note: 'array .includes: numeric element hit' },
  { src: "name.includes('ar')", env: { name: 'bare' }, note: 'string .includes: substring hit' },
  { src: 'item.tags.includes(tag)', env: { item: { tags: ['perl'] }, tag: 'perl' }, note: 'array .includes: needle from a materialized identifier' },

  // ----- realistic callback bodies (the issue's motivating shapes) --------
  { src: 'acc + item.price * item.qty', env: { acc: 100, item: { price: 5, qty: 3 } }, note: 'reduce body: running total with precedence' },
  { src: 'a.price - b.price', env: { a: { price: 30 }, b: { price: 10 } }, note: 'sort comparator: numeric field difference' },
  { src: 'item.qty * 2', env: { item: { qty: 21 } }, note: 'map body: arithmetic projection' },
  { src: "item.tags.length > 0 && item.active", env: { item: { tags: ['a'], active: true } }, note: 'filter body: length guard plus boolean field' },
]
