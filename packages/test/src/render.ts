/**
 * renderToTest — compile a TSX source string to a TestNode tree.
 *
 * Pipeline: source → analyzeComponent → jsxToIR → buildMetadata → irNodeToTestNode
 * Does NOT go through any adapter; operates on IR directly.
 */

import { analyzeComponent, jsxToIR } from '@barefootjs/jsx'
import type { IRMetadata, CompilerError } from '@barefootjs/jsx'
import { TestNode, type TestNodeQuery } from './test-node'
import { irNodeToTestNode } from './ir-to-test-node'
import { resolveConstants } from './resolve-constants'
import { toStructure } from './structure'

export interface TestResult {
  root: TestNode
  componentName: string
  isClient: boolean
  signals: string[]
  memos: string[]
  effects: number
  errors: Array<{ code: string; message: string; line: number }>

  // Delegated to root
  find: (query: TestNodeQuery) => TestNode | null
  findAll: (query: TestNodeQuery) => TestNode[]
  findByText: (text: string) => TestNode | null

  // Debug
  toStructure(): string
}

export function renderToTest(source: string, filePath: string, componentName?: string): TestResult {
  const ctx = analyzeComponent(source, filePath, componentName)

  // Collect errors from analysis phase
  const errors: TestResult['errors'] = ctx.errors.map(toSimpleError)

  if (!ctx.jsxReturn) {
    // No JSX return found — return a minimal result with errors
    return emptyResult(ctx.componentName || 'Unknown', ctx.hasUseClientDirective, errors)
  }

  const ir = jsxToIR(ctx)

  // Collect any additional errors from IR phase
  const allErrors = ctx.errors.map(toSimpleError)

  if (!ir) {
    return emptyResult(ctx.componentName || 'Unknown', ctx.hasUseClientDirective, allErrors)
  }

  const metadata = buildMetadata(ctx)
  const constantMap = resolveConstants(metadata.localConstants)
  const root = irNodeToTestNode(ir, constantMap)
  const signals = metadata.signals.map(s => s.getter)
  const memos = metadata.memos.map(m => m.name)
  const effects = metadata.effects.length

  return {
    root,
    componentName: metadata.componentName,
    isClient: metadata.isClientComponent,
    signals,
    memos,
    effects,
    errors: allErrors,
    find: (query) => root.find(query),
    findAll: (query) => root.findAll(query),
    findByText: (text) => root.findByText(text),
    toStructure: () => toStructure(root),
  }
}

function buildMetadata(
  ctx: ReturnType<typeof analyzeComponent>
): IRMetadata {
  return {
    componentName: ctx.componentName || 'Unknown',
    hasDefaultExport: ctx.hasDefaultExport,
    isClientComponent: ctx.hasUseClientDirective,
    typeDefinitions: ctx.typeDefinitions,
    propsType: ctx.propsType,
    propsParams: ctx.propsParams,
    propsObjectName: ctx.propsObjectName,
    restPropsName: ctx.restPropsName,
    restPropsExpandedKeys: ctx.restPropsExpandedKeys,
    signals: ctx.signals,
    memos: ctx.memos,
    effects: ctx.effects,
    onMounts: ctx.onMounts,
    imports: ctx.imports,
    localFunctions: ctx.localFunctions,
    localConstants: ctx.localConstants,
  }
}

function toSimpleError(err: CompilerError): TestResult['errors'][number] {
  return { code: err.code, message: err.message, line: err.loc.start.line }
}

function emptyResult(
  componentName: string,
  isClient: boolean,
  errors: TestResult['errors']
): TestResult {
  const root = new TestNode({
    tag: null,
    type: 'fragment',
    children: [],
    text: null,
    props: {},
    classes: [],
    role: null,
    aria: {},
    dataState: null,
    events: [],
    reactive: false,
    componentName: null,
  })

  return {
    root,
    componentName,
    isClient,
    signals: [],
    memos: [],
    effects: 0,
    errors,
    find: () => null,
    findAll: () => [],
    findByText: () => null,
    toStructure: () => '',
  }
}
