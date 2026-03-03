/**
 * AST-based TypeScript type stripping.
 *
 * Uses the TypeScript AST to collect text ranges of type-only syntax,
 * then reconstructs the source text by skipping those ranges.
 * This preserves original formatting exactly.
 *
 * Design: collectAllTypeRanges() walks the entire SourceFile once and produces
 * a sorted, merged ExcludeRange[]. reconstructWithoutTypes() then filters
 * those ranges to a node's span and rebuilds the text — no extra AST walk.
 */

import ts from 'typescript'

export interface ExcludeRange {
  start: number
  end: number
}

/**
 * Walk the entire SourceFile once and return all type-only text ranges,
 * sorted and merged. Store the result on AnalyzerContext so every
 * subsequent getJS(node) call is a cheap slice+filter.
 */
export function collectAllTypeRanges(sourceFile: ts.SourceFile): ExcludeRange[] {
  const ranges: ExcludeRange[] = []
  collectTypeRanges(sourceFile, sourceFile, sourceFile.text, ranges)
  ranges.sort((a, b) => a.start - b.start)
  return mergeRanges(ranges)
}

/**
 * Reconstruct a node's text by skipping pre-computed type ranges.
 * Only ranges overlapping the node's span are considered.
 */
export function reconstructWithoutTypes(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  ranges: ExcludeRange[]
): string {
  const nodeStart = node.getStart(sourceFile)
  const nodeEnd = node.getEnd()
  const fullText = sourceFile.text

  // Binary search for the first range that could overlap
  let lo = 0
  let hi = ranges.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ranges[mid].end <= nodeStart) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  let result = ''
  let pos = nodeStart
  for (let i = lo; i < ranges.length; i++) {
    const range = ranges[i]
    if (range.start >= nodeEnd) break
    if (range.start > pos) {
      result += fullText.slice(pos, range.start)
    }
    pos = Math.max(pos, range.end)
  }
  if (pos < nodeEnd) {
    result += fullText.slice(pos, nodeEnd)
  }

  return result
}

function mergeRanges(ranges: ExcludeRange[]): ExcludeRange[] {
  if (ranges.length === 0) return []
  const merged: ExcludeRange[] = [ranges[0]]
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1]
    if (ranges[i].start <= last.end) {
      last.end = Math.max(last.end, ranges[i].end)
    } else {
      merged.push(ranges[i])
    }
  }
  return merged
}

/**
 * Recursively walk the AST and collect text ranges of type-only syntax.
 */
function collectTypeRanges(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  fullText: string,
  ranges: ExcludeRange[]
): void {
  // Parameter type annotation: (x: Type) or optional parameter: (x?: Type)
  if (ts.isParameter(node)) {
    const hasQuestion = !!node.questionToken
    const hasType = !!node.type

    if (hasQuestion && hasType) {
      // Optional param with type: strip "?: Type"
      ranges.push({ start: node.questionToken!.getStart(sourceFile), end: node.type!.getEnd() })
    } else if (hasQuestion) {
      // Optional param without type: strip "?"
      ranges.push({ start: node.questionToken!.getStart(sourceFile), end: node.questionToken!.getEnd() })
    } else if (hasType) {
      // Required param with type: strip ": Type" (existing behavior)
      const colonPos = findColonBefore(node.type!, fullText, node.name.getEnd())
      if (colonPos >= 0) {
        ranges.push({ start: colonPos, end: node.type!.getEnd() })
      }
    }
  }

  // Variable declaration type annotation: let x: Type = value
  if (ts.isVariableDeclaration(node) && node.type) {
    const colonPos = findColonBefore(node.type, fullText, node.name.getEnd())
    if (colonPos >= 0) {
      ranges.push({ start: colonPos, end: node.type.getEnd() })
    }
  }

  // Arrow function return type: (): Type =>
  if (ts.isArrowFunction(node) && node.type) {
    const colonPos = findColonBefore(node.type, fullText, node.parameters.end)
    if (colonPos >= 0) {
      ranges.push({ start: colonPos, end: node.type.getEnd() })
    }
  }

  // Function declaration/expression return type
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.type) {
    const colonPos = findColonBefore(node.type, fullText, node.parameters.end)
    if (colonPos >= 0) {
      ranges.push({ start: colonPos, end: node.type.getEnd() })
    }
  }

  // Type assertion: expr as Type
  if (ts.isAsExpression(node)) {
    // Keep only the expression part, exclude " as Type"
    const exprEnd = node.expression.getEnd()
    ranges.push({ start: exprEnd, end: node.getEnd() })
    // Only recurse into the expression, not the type
    collectTypeRanges(node.expression, sourceFile, fullText, ranges)
    return
  }

  // Satisfies expression: expr satisfies Type
  if (ts.isSatisfiesExpression(node)) {
    const exprEnd = node.expression.getEnd()
    ranges.push({ start: exprEnd, end: node.getEnd() })
    collectTypeRanges(node.expression, sourceFile, fullText, ranges)
    return
  }

  // Non-null assertion: expr!
  if (ts.isNonNullExpression(node)) {
    // The `!` is between the expression end and the node end
    const exprEnd = node.expression.getEnd()
    ranges.push({ start: exprEnd, end: node.getEnd() })
    collectTypeRanges(node.expression, sourceFile, fullText, ranges)
    return
  }

  // Angle-bracket type assertion: <Type>expr
  if (ts.isTypeAssertionExpression(node)) {
    const exprStart = node.expression.getStart(sourceFile)
    ranges.push({ start: node.getStart(sourceFile), end: exprStart })
    collectTypeRanges(node.expression, sourceFile, fullText, ranges)
    return
  }

  // Call expression type arguments: fn<T>(...)
  if (ts.isCallExpression(node) && node.typeArguments) {
    const typeArgsStart = findAngleBracketBefore(node.typeArguments[0], fullText, node.expression.getEnd())
    const typeArgsEnd = findAngleBracketAfter(node.typeArguments[node.typeArguments.length - 1], fullText)
    if (typeArgsStart >= 0 && typeArgsEnd >= 0) {
      ranges.push({ start: typeArgsStart, end: typeArgsEnd })
    }
  }

  // New expression type arguments: new X<T>()
  if (ts.isNewExpression(node) && node.typeArguments) {
    const typeArgsStart = findAngleBracketBefore(node.typeArguments[0], fullText, node.expression.getEnd())
    const typeArgsEnd = findAngleBracketAfter(node.typeArguments[node.typeArguments.length - 1], fullText)
    if (typeArgsStart >= 0 && typeArgsEnd >= 0) {
      ranges.push({ start: typeArgsStart, end: typeArgsEnd })
    }
  }

  // Type-only nodes that are handled by parent patterns — skip recursion
  if (ts.isTypeNode(node)) return

  // Recurse into children
  ts.forEachChild(node, (child) => {
    collectTypeRanges(child, sourceFile, fullText, ranges)
  })
}

/**
 * Find the colon character before a type annotation node.
 */
function findColonBefore(typeNode: ts.Node, fullText: string, searchFrom: number): number {
  const typeStart = typeNode.getStart()
  for (let i = searchFrom; i < typeStart; i++) {
    if (fullText[i] === ':') return i
  }
  return -1
}

/**
 * Find the opening `<` before the first type argument.
 */
function findAngleBracketBefore(firstTypeArg: ts.Node, fullText: string, searchFrom: number): number {
  const typeArgStart = firstTypeArg.getStart()
  for (let i = typeArgStart - 1; i >= searchFrom; i--) {
    if (fullText[i] === '<') return i
  }
  return -1
}

/**
 * Find the closing `>` after the last type argument.
 */
function findAngleBracketAfter(lastTypeArg: ts.Node, fullText: string): number {
  const typeArgEnd = lastTypeArg.getEnd()
  for (let i = typeArgEnd; i < fullText.length; i++) {
    if (fullText[i] === '>') return i + 1
  }
  return -1
}
