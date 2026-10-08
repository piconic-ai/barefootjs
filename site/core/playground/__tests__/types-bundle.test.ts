/**
 * The editor's type bundle is what Monaco type-checks the playground buffer
 * against, and Monaco reports nothing when a declaration inside it fails to
 * resolve — the imports just become `any`. These tests hold the bundle to
 * the contract the editor needs, with the real TypeScript compiler standing
 * in for Monaco's worker over the same virtual `/node_modules` tree and the
 * same compiler options page-script.ts configures:
 *
 *  1. every module specifier inside the bundle resolves inside the bundle
 *     (no dangling re-export can leak `any` into the editor);
 *  2. the default source type-checks clean, and the signal it creates has
 *     its real type — the hover the user sees on `count`.
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { dirname } from 'node:path'
import ts from 'typescript'
import { DEFAULT_SOURCE } from '../default-source'
import {
  RESOLUTION_OPTIONS,
  buildPlaygroundTypesBundle,
  ensureDeclarations,
} from '../types-bundle'

const COMPONENT_PATH = '/playground/component.tsx'

// Mirrors `setCompilerOptions` in page-script.ts (Monaco's enum values are
// TypeScript's), plus the libs Monaco loads by default.
const COMPILER_OPTIONS: ts.CompilerOptions = {
  ...RESOLUTION_OPTIONS,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  jsxImportSource: '@barefootjs/hono/jsx',
  allowJs: true,
  noEmit: true,
  isolatedModules: true,
  esModuleInterop: true,
  skipLibCheck: true,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  types: [],
}

/** `file:///node_modules/x` (Monaco's extra-lib key) → `/node_modules/x`. */
function toVirtualFiles(bundle: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(bundle).map(([key, text]) => [key.replace(/^file:\/\//, ''), text]))
}

/** A compiler host over the virtual tree; only TypeScript's own lib files come from disk. */
function createVirtualHost(files: Map<string, string>): ts.CompilerHost {
  const libDir = dirname(ts.getDefaultLibFilePath(COMPILER_OPTIONS))
  const read = (path: string) =>
    files.get(path) ?? (path.startsWith(libDir) ? ts.sys.readFile(path) : undefined)
  return {
    fileExists: (path) => read(path) !== undefined,
    readFile: read,
    getSourceFile: (path, languageVersion) => {
      const text = read(path)
      return text === undefined ? undefined : ts.createSourceFile(path, text, languageVersion)
    },
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    writeFile: () => {
      throw new Error('noEmit program must not write')
    },
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  }
}

/** Declared type of every `const` binding in the source, by name. */
function declaredTypes(program: ts.Program, sourceFile: ts.SourceFile): Map<string, string> {
  const checker = program.getTypeChecker()
  const types = new Map<string, string>()
  const visit = (node: ts.Node) => {
    if ((ts.isVariableDeclaration(node) || ts.isBindingElement(node)) && ts.isIdentifier(node.name)) {
      types.set(node.name.text, checker.typeToString(checker.getTypeAtLocation(node.name)))
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return types
}

describe('playground type bundle', () => {
  let bundle: Record<string, string>

  beforeAll(async () => {
    await ensureDeclarations()
    bundle = buildPlaygroundTypesBundle()
  })

  test('every module specifier in the bundle resolves inside the bundle', () => {
    const files = toVirtualFiles(bundle)
    const host: ts.ModuleResolutionHost = {
      fileExists: (path) => files.has(path),
      readFile: (path) => files.get(path),
    }
    const dangling: string[] = []
    for (const [file, text] of files) {
      for (const { fileName: specifier } of ts.preProcessFile(text, true, false).importedFiles) {
        if (!ts.resolveModuleName(specifier, file, RESOLUTION_OPTIONS, host).resolvedModule) {
          dangling.push(`'${specifier}' from ${file}`)
        }
      }
    }
    expect(dangling).toEqual([])
  })

  test('the default source type-checks clean and its signal is typed', () => {
    const files = toVirtualFiles(bundle)
    files.set(COMPONENT_PATH, DEFAULT_SOURCE)
    const program = ts.createProgram([COMPONENT_PATH], COMPILER_OPTIONS, createVirtualHost(files))
    const sourceFile = program.getSourceFile(COMPONENT_PATH)!

    const diagnostics = ts
      .getPreEmitDiagnostics(program, sourceFile)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    expect(diagnostics).toEqual([])

    const types = declaredTypes(program, sourceFile)
    expect(types.get('count')).toBe('Reactive<() => number>')
    expect(types.get('setCount')).toBe('(valueOrFn: number | ((prev: number) => number)) => void')
  })
})
