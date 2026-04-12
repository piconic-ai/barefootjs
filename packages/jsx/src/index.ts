/**
 * BarefootJS JSX Compiler
 *
 * Multi-backend JSX compiler that generates Marked Templates and Client JS.
 */

// Main compiler API
export { compileJSX, compileJSXSync, buildMetadata } from './compiler'
export type { CompileResult, CompileOptions, CompileOptionsWithAdapter, FileOutput } from './compiler'

// Pure IR types
export type {
  ComponentIR,
  IRNode,
  IRElement,
  IRText,
  IRExpression,
  IRConditional,
  IRLoop,
  IRLoopChildComponent,
  IRComponent,
  IRFragment,
  IRSlot,
  IRIfStatement,
  IRProvider,
  IRMetadata,
  IRTemplateLiteral,
  IRTemplatePart,
  IRProp,
  ParamInfo,
  TypeInfo,
  SourceLocation,
  CompilerError,
} from './types'

// Analyzer
export { analyzeComponent, listComponentFunctions, listComponentFunctions as listExportedComponents, type AnalyzerContext } from './analyzer'

// JSX to IR transformer
export { jsxToIR } from './jsx-to-ir'

// Module exports generation (compiler layer)
export { generateModuleExports, extractFunctionParams, formatParamWithType, findReachableNames } from './module-exports'

// Adapters
export { BaseAdapter } from './adapters/interface'
export type { TemplateAdapter, AdapterOutput, AdapterGenerateOptions, TemplateSections } from './adapters/interface'
export { JsxAdapter } from './adapters/jsx-adapter'
export type { JsxAdapterConfig } from './adapters/jsx-adapter'

// Client JS Generator
export { generateClientJs, analyzeClientNeeds } from './ir-to-client-js'

// Client JS Combiner (for build scripts)
export { combineParentChildClientJs } from './combine-client-js'

// Build options (shared by adapters and CLI)
export interface BuildOptions {
  /** Source component directories relative to config file */
  components?: string[]
  /** Output directory relative to config file */
  outDir?: string
  /** Minify client JS output */
  minify?: boolean
  /** Add content hash to client JS filenames */
  contentHash?: boolean
  /** Output only client JS, skip marked templates and manifest */
  clientOnly?: boolean
}

// CSS Layer Prefixer
export { applyCssLayerPrefix } from './css-layer-prefixer'

// Errors
export { ErrorCodes, createError, formatError, generateCodeFrame } from './errors'

// Expression Parser
export { parseExpression, isSupported, exprToString, parseBlockBody } from './expression-parser'
export type { ParsedExpr, ParsedStatement, SupportLevel, SupportResult, TemplatePart } from './expression-parser'

// HTML constants
export { BOOLEAN_ATTRS, isBooleanAttr } from './html-constants'

// HTML element attribute types
export type {
  // Event types
  TargetedEvent,
  TargetedInputEvent,
  TargetedFocusEvent,
  TargetedKeyboardEvent,
  TargetedMouseEvent,

  // Event handlers
  InputEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  ChangeEventHandler,

  // Base attributes
  BaseEventAttributes,
  HTMLBaseAttributes,

  // Form attribute helper types
  HTMLAttributeFormEnctype,
  HTMLAttributeFormMethod,
  HTMLAttributeAnchorTarget,

  // Element-specific attributes
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  FormHTMLAttributes,
  AnchorHTMLAttributes,
  ImgHTMLAttributes,
  LabelHTMLAttributes,
  OptionHTMLAttributes,
} from './html-types'
