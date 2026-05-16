/**
 * Shared JS-text scanner built on `ts.createScanner`. Replaces the
 * hand-rolled, partially-overlapping character walkers that previously
 * lived in `ir-to-client-js/utils.ts`, the go-template adapter, and
 * `ir-to-client-js/control-flow/stringify/template-parse.ts` (#1254).
 *
 * The unified entry point is `iterateJsTokens`, which yields every TS
 * token (including trivia) with its byte range. The iterator handles
 * two re-scan dances that TS leaves to the parser by default:
 *
 *  - `/` vs regex literal: re-scan as regex when the prior significant
 *    token cannot end an expression (else `/foo/.test()` is read as
 *    division).
 *  - `}` vs template middle/tail: when inside a template literal at
 *    brace depth 0, re-scan `}` as `TemplateMiddle` / `TemplateTail`.
 *
 * The higher-level helpers (`replaceInExprContexts`,
 * `findInterpolationEnd`, `findTopLevelTemplateLiterals`) consume the
 * iterator. None of them re-implement the lexer.
 */

import ts from 'typescript'

export interface JsToken {
  /** Raw TS scanner kind. `TemplateHead` / `TemplateMiddle` / `TemplateTail` are post-rescan. */
  kind: ts.SyntaxKind
  /** Token start position (post-leading-trivia when `skipTrivia: false` is used; that is what we use). */
  pos: number
  /** Token end position. */
  end: number
}

/**
 * Lex `text` from `start` (inclusive) to `end` (exclusive, defaults to
 * end-of-text), yielding every token (trivia included). Regex literals
 * and template-middle / template-tail tokens are correctly produced.
 *
 * The walker does NOT classify expression-vs-string-content for
 * callers — that's the consumer's job, since the right answer depends
 * on what the consumer wants (e.g. `replaceInExprContexts` treats
 * template-string content as non-code; `findInterpolationEnd` cares
 * about brace depth, not classification).
 */
export function* iterateJsTokens(
  text: string,
  start = 0,
  end: number = text.length,
): Generator<JsToken> {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /*skipTrivia*/ false,
    ts.LanguageVariant.Standard,
    text,
    undefined,
    start,
    end - start,
  )

  // Track each enclosing template literal's brace depth so `}` is
  // re-scanned to `TemplateMiddle` / `TemplateTail` only when it
  // actually closes the template's `${...}` (depth 0), not when it
  // closes an object literal nested inside.
  const templateStack: { braceDepth: number }[] = []

  // Previous *significant* (non-trivia) token kind. Drives the `/`
  // regex-vs-division decision.
  let prevSignificant: ts.SyntaxKind | undefined

  while (true) {
    let kind = scanner.scan()
    if (kind === ts.SyntaxKind.EndOfFileToken) break

    // Disambiguate `/` and `/=` as regex literal when the prior
    // significant token cannot end an expression.
    if (
      (kind === ts.SyntaxKind.SlashToken || kind === ts.SyntaxKind.SlashEqualsToken)
      && canRegexStartHere(prevSignificant)
    ) {
      kind = scanner.reScanSlashToken()
    }

    // Re-interpret `}` as a template middle/tail when we're at the
    // surface level of a template literal's `${...}` block. Check is
    // *before* depth update so the decrement that takes depth from 1
    // → 0 still leaves the next `}` to re-scan.
    if (
      kind === ts.SyntaxKind.CloseBraceToken
      && templateStack.length > 0
      && templateStack[templateStack.length - 1]!.braceDepth === 0
    ) {
      kind = scanner.reScanTemplateToken(/*isTaggedTemplate*/ false)
    }

    if (kind === ts.SyntaxKind.TemplateHead) {
      templateStack.push({ braceDepth: 0 })
    } else if (kind === ts.SyntaxKind.TemplateMiddle) {
      // Still inside the same template literal; `${...}` resets brace depth.
      if (templateStack.length > 0) templateStack[templateStack.length - 1]!.braceDepth = 0
    } else if (kind === ts.SyntaxKind.TemplateTail) {
      templateStack.pop()
    } else if (templateStack.length > 0) {
      const top = templateStack[templateStack.length - 1]!
      if (kind === ts.SyntaxKind.OpenBraceToken) top.braceDepth++
      else if (kind === ts.SyntaxKind.CloseBraceToken) top.braceDepth--
    }

    yield { kind, pos: scanner.getTokenStart(), end: scanner.getTokenEnd() }

    if (!isTriviaKind(kind)) prevSignificant = kind
  }
}

function isTriviaKind(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.WhitespaceTrivia
    || kind === ts.SyntaxKind.NewLineTrivia
    || kind === ts.SyntaxKind.SingleLineCommentTrivia
    || kind === ts.SyntaxKind.MultiLineCommentTrivia
    || kind === ts.SyntaxKind.ShebangTrivia
    || kind === ts.SyntaxKind.ConflictMarkerTrivia
  )
}

/**
 * Whether a `/` appearing immediately after `prev` should be read as
 * the start of a regex literal. The rule is the standard "primary
 * expression follows" test: if the previous token ends an expression
 * (identifier, literal, `)`, `]`, `}`, ++ / -- postfix, `this`, etc.)
 * then `/` is division; otherwise it's a regex literal.
 *
 * `}` is conservatively treated as expression-ending so `{a: 1}/2/3`
 * is read as a chain of divisions. Block-trailing `}` (`if(x){}/re/`)
 * is rare in the expression strings these scanners see and falls into
 * the "wrong but safe" side — TS scanner would have produced
 * `SlashToken` for it anyway, matching the previous hand-rolled
 * behavior, which had no regex support at all.
 */
function canRegexStartHere(prev: ts.SyntaxKind | undefined): boolean {
  if (prev === undefined) return true
  switch (prev) {
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateTail:
    case ts.SyntaxKind.RegularExpressionLiteral:
    case ts.SyntaxKind.CloseParenToken:
    case ts.SyntaxKind.CloseBracketToken:
    case ts.SyntaxKind.CloseBraceToken:
    case ts.SyntaxKind.PlusPlusToken:
    case ts.SyntaxKind.MinusMinusToken:
    case ts.SyntaxKind.ThisKeyword:
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.SuperKeyword:
      return false
    default:
      return true
  }
}

// ---------------------------------------------------------------------------
// Token classification helpers used by the consumers below.

/** A token whose textual content is a non-code region (string body, regex, comment). */
function isOpaqueContentKind(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.StringLiteral
    || kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral
    || kind === ts.SyntaxKind.RegularExpressionLiteral
    || kind === ts.SyntaxKind.SingleLineCommentTrivia
    || kind === ts.SyntaxKind.MultiLineCommentTrivia
  )
}

// ---------------------------------------------------------------------------
// Consumer 1: replaceInExprContexts (used by utils.ts's loop-param wrappers)

// Internal alias for the `String.prototype.replace` replacer signature.
// Not exported — callers pass either a literal string or an inline callback.
type Replacement = string | ((substring: string, ...args: any[]) => string)

/**
 * Apply `re` / `replacement` to `code`, but only in expression-context
 * regions — string literals, regex literals, comments, and the
 * literal-string bodies of template literals are left untouched.
 *
 * Inside a template literal, the `${...}` interpolation body is
 * expression context (replacements apply); the surrounding string
 * body is not.
 *
 * Consecutive expression-context tokens are batched into a single
 * slice before the regex runs, so lookahead / lookbehind in the
 * regex see across token boundaries (e.g. the negative lookahead
 * `\bfoo\b(?!\s*\()` correctly skips `foo(...)` calls — replacing
 * per-token would lose sight of the `(` that lives in the next
 * token and would mis-wrap an already-wrapped `foo()` into
 * `foo()()`).
 *
 * `re` is reset before each replace call so callers can pass `/g`
 * regexes without worrying about `lastIndex` state.
 */
export function replaceInExprContexts(
  code: string,
  re: RegExp,
  replacement: Replacement,
): string {
  let out = ''
  let codeStart = -1

  const flushCode = (end: number) => {
    if (codeStart < 0 || end <= codeStart) {
      codeStart = -1
      return
    }
    out += applyReplacement(code.slice(codeStart, end), re, replacement)
    codeStart = -1
  }

  for (const tok of iterateJsTokens(code)) {
    // Scanner ambiguity / malformed bytes: emit the raw text and skip
    // replacement so we don't apply user-supplied regex to bytes the
    // lexer couldn't classify.
    if (tok.kind === ts.SyntaxKind.Unknown) {
      flushCode(tok.pos)
      out += code.slice(tok.pos, tok.end)
      continue
    }
    const isOpaque =
      isOpaqueContentKind(tok.kind)
      || tok.kind === ts.SyntaxKind.TemplateHead
      || tok.kind === ts.SyntaxKind.TemplateMiddle
      || tok.kind === ts.SyntaxKind.TemplateTail
    if (isOpaque) {
      flushCode(tok.pos)
      out += code.slice(tok.pos, tok.end)
    } else {
      // Code-context token (identifier, punctuation, whitespace, etc.).
      // Extend the current code chunk so the regex sees neighbouring
      // tokens (e.g. the `(` after an identifier) via lookahead.
      if (codeStart < 0) codeStart = tok.pos
    }
  }
  flushCode(code.length)
  return out
}

function applyReplacement(slice: string, re: RegExp, replacement: Replacement): string {
  re.lastIndex = 0
  return typeof replacement === 'string'
    ? slice.replace(re, replacement)
    : slice.replace(re, replacement)
}

// ---------------------------------------------------------------------------
// Consumer 2: findInterpolationEnd (used by both go-template adapter and
// template-parse.ts).

/**
 * Walk forward from inside an opened `${`, returning the index of the
 * matching closing `}`. Tracks brace depth across nested `{...}`,
 * strings, template literals (recursively), comments, and regex
 * literals so braces that appear inside any of those don't fool the
 * matcher.
 *
 *  - `start` is the index *just after* the opening `${`.
 *  - Returns the index of the matching `}` (the same byte the previous
 *    hand-rolled scanners returned), or -1 when no match exists.
 */
export function findInterpolationEnd(code: string, start: number): number {
  let depth = 1
  for (const tok of iterateJsTokens(code, start)) {
    // Treat any byte the scanner couldn't classify as a hard bail —
    // an unbalanced match here would feed the rest of the string as
    // a Go template / interpolation body, which is worse than
    // refusing the input.
    if (tok.kind === ts.SyntaxKind.Unknown) return -1
    if (tok.kind === ts.SyntaxKind.OpenBraceToken) {
      depth++
    } else if (tok.kind === ts.SyntaxKind.CloseBraceToken) {
      depth--
      if (depth === 0) return tok.pos
    }
    // Note: TemplateHead / Middle / Tail tokens absorb the structural
    // `${` and `}` markers, so they don't change the *outer* brace
    // depth. The iterator handles their internal brace-depth state on
    // its own stack.
  }
  // Hit EOF without closing the outer brace — the input is unbalanced
  // (an unterminated string or template would have left the scanner
  // mid-token; an unclosed `${` body simply runs off the end).
  return -1
}

// ---------------------------------------------------------------------------
// Consumer 3: findTopLevelTemplateLiterals (used by template-parse.ts).

/**
 * Walk a JS expression string and return the contents of every backtick
 * template literal that appears at the top level — i.e., not nested
 * inside another template literal's own `${...}`. Parentheses are
 * transparent so `cond ? (`<a/>`) : (`<b/>`)` still surfaces both
 * branches.
 *
 * Returns `null` if the scanner sees an unbalanced delimiter (the
 * previous hand-rolled behavior; callers treat that as "shape doesn't
 * qualify for the wrap").
 */
export function findTopLevelTemplateLiterals(code: string): string[] | null {
  const out: string[] = []
  // Reconstructed template body of the currently-open top-level template.
  let openTemplateBody: string | null = null
  // Depth of nesting *inside* the currently-open top-level template (1
  // for the template itself, 2+ if we descend into a nested template's
  // `${...}` then another template, etc.). When `nesting === 1` we are
  // accumulating string body for the top-level template; deeper than
  // that we accumulate the raw inner template-literal text verbatim
  // (the consumer wants the literal source, brace-balanced).
  let nesting = 0
  let sawError = false

  for (const tok of iterateJsTokens(code)) {
    const text = code.slice(tok.pos, tok.end)

    if (tok.kind === ts.SyntaxKind.Unknown) {
      sawError = true
      break
    }

    if (tok.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
      if (nesting === 0) {
        // Top-level no-substitution template. Body is between the backticks.
        out.push(text.slice(1, -1))
      } else {
        // Inside a nested template's expression — append verbatim.
        if (openTemplateBody !== null) openTemplateBody += text
      }
      continue
    }

    if (tok.kind === ts.SyntaxKind.TemplateHead) {
      if (nesting === 0) {
        // Opening the top-level template. Body starts after the leading
        // backtick and runs up to (but not including) `${`. Reconstruction
        // happens incrementally because the rest of the template is split
        // across more tokens.
        openTemplateBody = text.slice(1, text.length - 2) + '${'
      } else {
        // Nested template inside a top-level template's expression — just
        // append the raw text verbatim.
        if (openTemplateBody !== null) openTemplateBody += text
      }
      nesting++
      continue
    }

    if (tok.kind === ts.SyntaxKind.TemplateMiddle) {
      if (nesting === 1 && openTemplateBody !== null) {
        // Continuation of the top-level template's body: `}<body>${`.
        openTemplateBody += '}' + text.slice(1, text.length - 2) + '${'
      } else {
        if (openTemplateBody !== null) openTemplateBody += text
      }
      continue
    }

    if (tok.kind === ts.SyntaxKind.TemplateTail) {
      if (nesting === 1 && openTemplateBody !== null) {
        // Final segment of the top-level template: `}<body>`.
        openTemplateBody += '}' + text.slice(1, text.length - 1)
        out.push(openTemplateBody)
        openTemplateBody = null
      } else {
        if (openTemplateBody !== null) openTemplateBody += text
      }
      nesting--
      continue
    }

    // Any other token while we're inside a top-level template's
    // expression: append its raw text so nested template-literal
    // reconstruction stays byte-exact.
    if (openTemplateBody !== null) {
      openTemplateBody += text
    }
  }

  if (sawError || openTemplateBody !== null) return null
  return out
}
