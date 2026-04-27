/**
 * BarefootJS Compiler - Template Adapter Interface
 *
 * Defines the interface for language-specific template adapters.
 */

import type {
  ComponentIR,
  IRNode,
  IRElement,
  IRExpression,
  IRConditional,
  IRLoop,
  IRComponent,
  IRAsync,
} from '../types'

export interface TemplateSections {
  imports: string
  types: string
  component: string
  defaultExport: string
}

export interface AdapterOutput {
  /** Complete assembled template string (backward compat for external consumers) */
  template: string
  /** Structured sections for compiler assembly. When present, compiler uses these
   *  instead of re-parsing template. */
  sections?: TemplateSections
  types?: string // Generated types (for typed languages)
  extension: string
}

export interface AdapterGenerateOptions {
  /** Skip script registration (for child components bundled in parent's .client.js) */
  skipScriptRegistration?: boolean
  /** Base name for script registration (for non-default exports sharing parent's .client.js) */
  scriptBaseName?: string
}

export interface TemplateAdapter {
  name: string
  extension: string
  /**
   * When true, compileJSX emits one markedTemplate FileOutput per component function
   * in a multi-component source file, instead of combining all into one file.
   * Required for adapters that look up templates by filename (e.g. Mojolicious).
   */
  templatesPerComponent?: boolean
  /**
   * Module specifier of the SSR shim for `@barefootjs/client` (and
   * `/runtime`). When set, the compiler rewrites client-package imports in
   * SSR templates to point at this shim instead of stripping them. The shim
   * is expected to provide SSR-safe stubs for `useContext`, `provideContext`,
   * pure helpers (`splitProps`, `unwrap`, ...), and throwing stubs for
   * reactive primitives that the compiler should never reach at SSR.
   *
   * When undefined, the compiler keeps the legacy whole-package strip
   * behaviour for adapters that do not run JS at SSR (e.g. go-template).
   */
  clientShimSource?: string

  // Main entry point - generates complete template from IR
  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput

  // Node rendering
  renderNode(node: IRNode): string
  renderElement(element: IRElement): string
  renderExpression(expr: IRExpression): string
  renderConditional(cond: IRConditional): string
  renderLoop(loop: IRLoop): string
  renderComponent(comp: IRComponent): string
  renderAsync(node: IRAsync): string

  // Hydration markers
  renderScopeMarker(instanceIdExpr: string): string
  renderSlotMarker(slotId: string): string
  renderCondMarker(condId: string): string

  // Type generation (for typed languages)
  generateTypes?(ir: ComponentIR): string | null
}

// Base class with common functionality
export abstract class BaseAdapter implements TemplateAdapter {
  abstract name: string
  abstract extension: string

  abstract generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput
  abstract renderNode(node: IRNode): string
  abstract renderElement(element: IRElement): string
  abstract renderExpression(expr: IRExpression): string
  abstract renderConditional(cond: IRConditional): string
  abstract renderLoop(loop: IRLoop): string
  abstract renderComponent(comp: IRComponent): string
  abstract renderScopeMarker(instanceIdExpr: string): string
  abstract renderSlotMarker(slotId: string): string
  abstract renderCondMarker(condId: string): string

  renderChildren(children: IRNode[]): string {
    return children.map((child) => this.renderNode(child)).join('')
  }

  /** Default: render fallback + children inline (no streaming). Override for streaming support. */
  renderAsync(node: IRAsync): string {
    return this.renderNode(node.fallback) + this.renderChildren(node.children)
  }
}
