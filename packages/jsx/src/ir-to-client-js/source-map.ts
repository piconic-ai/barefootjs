/**
 * Source Map V3 generator for client JS output.
 *
 * Produces standard source maps (https://sourcemaps.info/spec.html) that map
 * generated client JS back to original .tsx source files.
 * No external dependencies — VLQ encoding is implemented inline.
 */

import type { SourceLocation } from '../types'

// =============================================================================
// VLQ Base64 Encoding
// =============================================================================

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function encodeVLQ(value: number): string {
  let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1
  let encoded = ''
  do {
    let digit = vlq & 0x1f
    vlq >>>= 5
    if (vlq > 0) digit |= 0x20
    encoded += BASE64_CHARS[digit]
  } while (vlq > 0)
  return encoded
}

// =============================================================================
// Source Map Builder
// =============================================================================

export interface SourceMapping {
  /** Generated line (0-indexed) */
  generatedLine: number
  /** Generated column (0-indexed) */
  generatedColumn: number
  /** Source file index */
  sourceIndex: number
  /** Original line (0-indexed) */
  originalLine: number
  /** Original column (0-indexed) */
  originalColumn: number
}

export interface SourceMapV3 {
  version: 3
  file: string
  sourceRoot: string
  sources: string[]
  sourcesContent: (string | null)[]
  names: string[]
  mappings: string
}

export class SourceMapGenerator {
  private sources: string[] = []
  private sourcesContent: (string | null)[] = []
  private sourceIndexMap = new Map<string, number>()
  private mappings: SourceMapping[] = []
  private file: string

  constructor(generatedFile: string) {
    this.file = generatedFile
  }

  /**
   * Register a source file and return its index.
   * If content is provided, it's stored for inline source content.
   */
  addSource(sourcePath: string, content?: string): number {
    const existing = this.sourceIndexMap.get(sourcePath)
    if (existing !== undefined) return existing
    const index = this.sources.length
    this.sources.push(sourcePath)
    this.sourcesContent.push(content ?? null)
    this.sourceIndexMap.set(sourcePath, index)
    return index
  }

  /**
   * Add a mapping from a generated position to a source position.
   * Uses SourceLocation from the IR for convenience.
   */
  addMappingFromLoc(generatedLine: number, generatedColumn: number, loc: SourceLocation): void {
    const sourceIndex = this.addSource(loc.file)
    this.mappings.push({
      generatedLine,
      generatedColumn,
      sourceIndex,
      originalLine: loc.start.line - 1, // Convert to 0-indexed
      originalColumn: loc.start.column,
    })
  }

  /** Produce the V3 source map JSON object. */
  toJSON(): SourceMapV3 {
    return {
      version: 3,
      file: this.file,
      sourceRoot: '',
      sources: this.sources,
      sourcesContent: this.sourcesContent,
      names: [],
      mappings: this.encodeMappings(),
    }
  }

  /** Produce the source map as a JSON string. */
  toString(): string {
    return JSON.stringify(this.toJSON())
  }

  /** Encode all mappings into the V3 "mappings" string. */
  private encodeMappings(): string {
    // Sort mappings by generated position
    const sorted = [...this.mappings].sort((a, b) =>
      a.generatedLine - b.generatedLine || a.generatedColumn - b.generatedColumn
    )

    const lines: string[][] = []

    let prevGeneratedColumn = 0
    let prevSourceIndex = 0
    let prevOriginalLine = 0
    let prevOriginalColumn = 0
    let prevGeneratedLine = 0

    for (const mapping of sorted) {
      // Fill empty lines
      while (lines.length <= mapping.generatedLine) {
        lines.push([])
        if (lines.length > 1) {
          prevGeneratedColumn = 0
        }
      }

      if (mapping.generatedLine !== prevGeneratedLine) {
        prevGeneratedColumn = 0
        prevGeneratedLine = mapping.generatedLine
      }

      const segment =
        encodeVLQ(mapping.generatedColumn - prevGeneratedColumn) +
        encodeVLQ(mapping.sourceIndex - prevSourceIndex) +
        encodeVLQ(mapping.originalLine - prevOriginalLine) +
        encodeVLQ(mapping.originalColumn - prevOriginalColumn)

      lines[mapping.generatedLine].push(segment)

      prevGeneratedColumn = mapping.generatedColumn
      prevSourceIndex = mapping.sourceIndex
      prevOriginalLine = mapping.originalLine
      prevOriginalColumn = mapping.originalColumn
    }

    return lines.map(segments => segments.join(',')).join(';')
  }
}

// =============================================================================
// Code Builder with Source Map Tracking
// =============================================================================

/**
 * A code builder that tracks line counts and can record source mappings.
 * Wraps a string[] lines array, recording optional source locations for each line.
 */
export class MappedCodeBuilder {
  private lines: string[] = []
  private generator: SourceMapGenerator | null

  constructor(generator: SourceMapGenerator | null) {
    this.generator = generator
  }

  /** Current line count (0-indexed next line). */
  get lineCount(): number {
    return this.lines.length
  }

  /** Push a line of code, optionally mapping it to a source location. */
  push(line: string, loc?: SourceLocation): void {
    if (loc && this.generator) {
      // Map to the first non-whitespace column
      const indent = line.length - line.trimStart().length
      this.generator.addMappingFromLoc(this.lines.length, indent, loc)
    }
    this.lines.push(line)
  }

  /** Push multiple lines at once. */
  pushLines(code: string, loc?: SourceLocation): void {
    const codeLines = code.split('\n')
    for (let i = 0; i < codeLines.length; i++) {
      this.push(codeLines[i], i === 0 ? loc : undefined)
    }
  }

  /** Join all lines into a single string. */
  join(separator: string = '\n'): string {
    return this.lines.join(separator)
  }

  /** Get the underlying lines array (for compatibility). */
  getLines(): string[] {
    return this.lines
  }
}

/**
 * Build source map for already-generated client JS by post-processing.
 * Maps key code patterns back to their source locations using IR metadata.
 *
 * This is used when the code has already been generated without a MappedCodeBuilder,
 * providing an "after the fact" source map based on the IR metadata.
 */
export function buildSourceMapFromIR(
  generatedCode: string,
  ir: import('../types').ComponentIR,
  generatedFileName: string,
): SourceMapV3 {
  const gen = new SourceMapGenerator(generatedFileName)
  const lines = generatedCode.split('\n')
  const meta = ir.metadata

  // Register the source file from the first available location
  const sourceFile = findSourceFile(ir)
  if (!sourceFile) {
    return gen.toJSON()
  }

  gen.addSource(sourceFile)

  // Map signal declarations
  for (const signal of meta.signals) {
    const pattern = signal.setter
      ? `createSignal(`
      : signal.getter
    const lineIdx = findLineIndex(lines, pattern)
    if (lineIdx >= 0) {
      gen.addMappingFromLoc(lineIdx, indentOf(lines[lineIdx]), signal.loc)
    }
  }

  // Map memo declarations
  for (const memo of meta.memos) {
    const lineIdx = findLineIndex(lines, `createMemo(`)
    if (lineIdx >= 0) {
      gen.addMappingFromLoc(lineIdx, indentOf(lines[lineIdx]), memo.loc)
    }
  }

  // Map effect bodies
  for (const effect of meta.effects) {
    const lineIdx = findLineIndex(lines, `createEffect(`)
    if (lineIdx >= 0) {
      gen.addMappingFromLoc(lineIdx, indentOf(lines[lineIdx]), effect.loc)
    }
  }

  // Map onMount callbacks
  for (const onMount of meta.onMounts) {
    const lineIdx = findLineIndex(lines, `onMount(`)
    if (lineIdx >= 0) {
      gen.addMappingFromLoc(lineIdx, indentOf(lines[lineIdx]), onMount.loc)
    }
  }

  // Map event handlers by looking for on() calls with event names
  mapEventHandlers(lines, ir.root, gen)

  // Map the init function declaration to the component function
  const initLine = findLineIndex(lines, `export function init${meta.componentName}(`)
  if (initLine >= 0 && ir.root.loc) {
    gen.addMappingFromLoc(initLine, 0, ir.root.loc)
  }

  return gen.toJSON()
}

/** Find the source file path from the IR (first available SourceLocation). */
function findSourceFile(ir: import('../types').ComponentIR): string | null {
  if (ir.root.loc?.file) return ir.root.loc.file
  for (const s of ir.metadata.signals) {
    if (s.loc?.file) return s.loc.file
  }
  for (const m of ir.metadata.memos) {
    if (m.loc?.file) return m.loc.file
  }
  return null
}

/** Find the first line index containing a pattern. */
function findLineIndex(lines: string[], pattern: string, startFrom = 0): number {
  for (let i = startFrom; i < lines.length; i++) {
    if (lines[i].includes(pattern)) return i
  }
  return -1
}

/** Get indent level (number of leading whitespace chars). */
function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

/** Map event handlers from IR tree to generated code lines. */
function mapEventHandlers(
  lines: string[],
  node: import('../types').IRNode,
  gen: SourceMapGenerator,
): void {
  if (node.type === 'element') {
    for (const event of node.events) {
      const pattern = `'${event.name}'`
      const lineIdx = findLineIndex(lines, pattern)
      if (lineIdx >= 0) {
        gen.addMappingFromLoc(lineIdx, indentOf(lines[lineIdx]), event.loc)
      }
    }
    for (const child of node.children) {
      mapEventHandlers(lines, child, gen)
    }
  } else if (node.type === 'fragment' || node.type === 'provider') {
    for (const child of node.children) {
      mapEventHandlers(lines, child, gen)
    }
  } else if (node.type === 'conditional') {
    mapEventHandlers(lines, node.whenTrue, gen)
    mapEventHandlers(lines, node.whenFalse, gen)
  } else if (node.type === 'loop') {
    for (const child of node.children) {
      mapEventHandlers(lines, child, gen)
    }
  }
}
